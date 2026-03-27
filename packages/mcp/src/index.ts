#!/usr/bin/env node
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "@agora/sdk";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { CatalogRegistry } from "./catalogs/catalog-registry.js";
import { resolveActiveCatalogs } from "./catalogs/directory/index.js";
import { DuckDbFtsIndex } from "./search/fts/fts-index.js";
import { TransformersEmbedder } from "./search/semantic/embedder.js";
import { VectraVectorStore } from "./search/semantic/vector-store.js";
import { IngestionService } from "./ingestion-service.js";
import { HybridSearchEngine } from "./search/search-engine.js";
import { registerTools } from "./tools.js";
import { AnalysisEngine } from "./analysis/analysis-engine.js";
import { HealthCache } from "./health/health-cache.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

// --- Resolve active catalogs from config ---
const activeCatalogs = resolveActiveCatalogs(config.presets, config.catalogIds);
logger.info("Active catalogs resolved", {
  count: activeCatalogs.length,
  catalogs: activeCatalogs.map((c) => c.id),
});

const registry = new CatalogRegistry(activeCatalogs, logger);

// --- FTS indexes (one per catalog, language-aware) ---
const ftsIndexes = new Map<string, DuckDbFtsIndex>();
for (const entry of activeCatalogs) {
  ftsIndexes.set(
    entry.id,
    new DuckDbFtsIndex(
      entry.id,
      entry.language,
      entry.country,
      config.dataDir,
      logger,
    ),
  );
}

// --- Semantic search (embeddings + vector store) ---
const embedder = new TransformersEmbedder(
  logger,
  "Xenova/all-MiniLM-L6-v2",
  384,
  config.embeddingBatchSize,
);

const vectorStore = new VectraVectorStore(
  join(config.dataDir, "indexes", "vector"),
  logger,
);
await vectorStore.initialize();

// --- Ingestion service ---
const ingestion = new IngestionService(
  registry,
  config,
  logger,
  ftsIndexes,
  embedder,
  vectorStore,
);

// --- MCP Server ---
const server = new McpServer(
  { name: "agora-mcp", version: VERSION },
  {
    capabilities: { tools: { listChanged: true } },
    instructions:
      "Servidor MCP para consultar catálogos de datos abiertos gubernamentales. " +
      "Permite buscar datasets, inspeccionar recursos y ejecutar consultas SQL.",
  },
);

const searchEngine = new HybridSearchEngine(ingestion, logger);
const analysisEngine = new AnalysisEngine(
  {
    cacheDir: join(config.cacheDir, "files"),
    queryTimeoutMs: config.queryTimeoutMs,
    maxFileSizeBytes: config.maxFileSizeBytes,
  },
  logger,
);
const healthCache = new HealthCache(
  { healthDir: join(config.dataDir, "health") },
  logger,
);
registerTools(server, logger, registry, ingestion, searchEngine, analysisEngine, healthCache);

logger.info("Ágora MCP Server starting", {
  version: VERSION,
  dataDir: config.dataDir,
  cacheDir: config.cacheDir,
  logLevel: config.logLevel,
  activeCatalogs: activeCatalogs.map((c) => c.id),
});

// PHASE 1: Metadata + FTS (synchronous, fast — seconds)
await ingestion.initialize();

logger.info("FTS ready", { totalDatasets: ingestion.totalCount });

// PHASE 2: Connect server (now accepting requests with FTS search)
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("Server connected via STDIO — FTS search active");

// PHASE 3: Embeddings in background (async, can take minutes on first run)
ingestion.embedInBackground().then(() => {
  logger.info("Hybrid search ready — embeddings complete");
}).catch((error) => {
  logger.error("Background embedding failed", { error: String(error) });
});
