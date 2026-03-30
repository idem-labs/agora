import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../config.js";
import { createLogger } from "../logger.js";
import { CatalogRegistry } from "../catalogs/catalog-registry.js";
import { DuckDbFtsIndex } from "../search/fts/fts-index.js";
import { IngestionService } from "../ingestion-service.js";
import { HybridSearchEngine } from "../search/search-engine.js";
import { AnalysisEngine } from "../analysis/analysis-engine.js";
import { HealthCache } from "../health/health-cache.js";
import { registerTools } from "../tools.js";

const TOOL_NAMES = [
  "search_datasets",
  "inspect_resource",
  "query_sql",
  "list_catalogs",
  "dataset_info",
  "create_sql_session",
  "close_session",
  "verify_resources",
  "search_series",
  "query_series",
];

const FAKE_DATASETS = [
  {
    id: "datos-gob-ar:test-dataset-1",
    catalogId: "datos-gob-ar",
    externalId: "test-dataset-1",
    title: "Presupuesto Nacional 2024",
    description: "Datos de ejecución presupuestaria del gobierno nacional",
    organization: "Ministerio de Economía",
    tags: ["presupuesto", "economía", "finanzas"],
    license: "Creative Commons Attribution",
    resources: [
      {
        id: "res-1",
        datasetId: "datos-gob-ar:test-dataset-1",
        url: "https://example.com/presupuesto.csv",
        format: "CSV",
        name: "presupuesto.csv",
      },
    ],
  },
  {
    id: "datos-gob-ar:test-dataset-2",
    catalogId: "datos-gob-ar",
    externalId: "test-dataset-2",
    title: "Población por provincia",
    description: "Censo de población por provincia argentina",
    organization: "INDEC",
    tags: ["censo", "población", "demografía"],
    resources: [
      {
        id: "res-2",
        datasetId: "datos-gob-ar:test-dataset-2",
        url: "https://example.com/poblacion.csv",
        format: "CSV",
        name: "poblacion.csv",
      },
    ],
  },
];

describe("Integration: MCP Server startup", () => {
  let tmpDir: string;
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    // Set up temp directory with pre-seeded metadata cache
    tmpDir = await mkdtemp(join(tmpdir(), "agora-test-"));
    const dataDir = join(tmpDir, "data");
    const cacheDir = join(tmpDir, "cache");
    await mkdir(join(dataDir, "metadata"), { recursive: true });

    // Seed metadata cache so no network calls are needed
    await writeFile(
      join(dataDir, "metadata", "datos-gob-ar.json"),
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        catalogId: "datos-gob-ar",
        datasets: FAKE_DATASETS,
      }),
    );

    const config: Config = {
      dataDir,
      cacheDir,
      logLevel: "warn",
      metadataTtlHours: 24,
      presets: [],
      catalogIds: ["datos-gob-ar"],
      embeddingBatchSize: 64,
      queryTimeoutMs: 60_000,
      maxFileSizeBytes: 200 * 1024 * 1024,
    };

    const logger = createLogger(config.logLevel);
    const registry = new CatalogRegistry(
      [{ id: "datos-gob-ar", name: "datos.gob.ar", url: "https://datos.gob.ar", protocol: "ckan" as const, language: "es", country: "AR", tags: [] }],
      logger,
    );

    // FTS index (one for the test catalog)
    const ftsIndexes = new Map<string, DuckDbFtsIndex>();
    ftsIndexes.set(
      "datos-gob-ar",
      new DuckDbFtsIndex("datos-gob-ar", "es", "AR", dataDir, logger),
    );

    // No embedder / vector store — FTS only mode
    const ingestion = new IngestionService(
      registry,
      config,
      logger,
      ftsIndexes,
    );

    // Phase 1: Initialize (metadata + FTS)
    const start = Date.now();
    await ingestion.initialize();
    const startupMs = Date.now() - start;

    // Verify startup is fast (< 5s)
    expect(startupMs).toBeLessThan(5000);

    // Phase 2: Create and connect server
    server = new McpServer(
      { name: "agora-mcp", version: "0.0.1-test" },
      { capabilities: { tools: { listChanged: true } } },
    );

    const searchEngine = new HybridSearchEngine(ingestion, logger);
    const analysisEngine = new AnalysisEngine(
      { cacheDir: join(cacheDir, "files") },
      logger,
    );
    const healthCache = new HealthCache(
      { healthDir: join(dataDir, "health") },
      logger,
    );
    const { TimeSeriesRegistry } = await import("../series/registry.js");
    const seriesRegistry = new TimeSeriesRegistry(logger);
    registerTools(server, logger, registry, ingestion, searchEngine, analysisEngine, healthCache, seriesRegistry);

    // Connect via in-memory transport
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    await server?.close();
    // DuckDB may hold file locks on Windows; best-effort cleanup
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore — OS will clean temp dir
    }
  }, 15_000);

  it("registers all 10 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(TOOL_NAMES.sort());
  });

  it("each tool has a description and input schema", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      // Tools without parameters (listar_catalogos) have an empty schema
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("listar_catalogos returns a result", async () => {
    const result = await client.callTool({ name: "list_catalogs", arguments: {} });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("datos-gob-ar");
  });

  it("buscar_datasets finds seeded data", async () => {
    const result = await client.callTool({
      name: "search_datasets",
      arguments: { query: "presupuesto", limite: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Presupuesto");
  });

  it("info_dataset returns dataset details", async () => {
    const result = await client.callTool({
      name: "dataset_info",
      arguments: { id: "datos-gob-ar:test-dataset-1" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Presupuesto Nacional 2024");
    expect(text).toContain("Ministerio de Economía");
  });
});
