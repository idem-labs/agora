/**
 * Integration test: multi-catalog runtime.
 * Verifies ingestion, cross-catalog search, catalog filtering, and health annotations
 * work correctly with 2+ catalogs active simultaneously.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
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
import type { CatalogEntry } from "../catalogs/directory/types.js";

type TextContent = { type: string; text: string };

const CATALOG_AR: CatalogEntry = {
  id: "datos-gob-ar",
  name: "datos.gob.ar",
  url: "https://datos.gob.ar",
  protocol: "ckan",
  language: "es",
  country: "AR",
  tags: [],
};

const CATALOG_CL: CatalogEntry = {
  id: "datos-gob-cl",
  name: "datos.gob.cl",
  url: "https://datos.gob.cl",
  protocol: "ckan",
  language: "es",
  country: "CL",
  tags: [],
};

function makeDatasets(baseUrl: string) {
  return {
    ar: [
      {
        id: "datos-gob-ar:presupuesto-2024",
        catalogId: "datos-gob-ar",
        externalId: "presupuesto-2024",
        title: "Presupuesto Nacional 2024",
        description: "Ejecución presupuestaria del gobierno argentino",
        organization: "Ministerio de Economía",
        tags: ["presupuesto", "economía"],
        resources: [
          {
            id: "ar-r1",
            datasetId: "datos-gob-ar:presupuesto-2024",
            url: `${baseUrl}/ar-presupuesto.csv`,
            format: "CSV",
            name: "presupuesto_2024.csv",
          },
        ],
      },
      {
        id: "datos-gob-ar:transporte-amba",
        catalogId: "datos-gob-ar",
        externalId: "transporte-amba",
        title: "Transporte público AMBA",
        description: "Datos de transporte público del área metropolitana",
        organization: "Ministerio de Transporte",
        tags: ["transporte"],
        resources: [
          {
            id: "ar-r2",
            datasetId: "datos-gob-ar:transporte-amba",
            url: `${baseUrl}/ar-transporte.csv`,
            format: "CSV",
            name: "transporte.csv",
          },
        ],
      },
    ],
    cl: [
      {
        id: "datos-gob-cl:presupuesto-chile-2024",
        catalogId: "datos-gob-cl",
        externalId: "presupuesto-chile-2024",
        title: "Presupuesto de Chile 2024",
        description: "Ejecución presupuestaria del gobierno chileno",
        organization: "Dirección de Presupuestos",
        tags: ["presupuesto", "finanzas"],
        resources: [
          {
            id: "cl-r1",
            datasetId: "datos-gob-cl:presupuesto-chile-2024",
            url: `${baseUrl}/cl-presupuesto.csv`,
            format: "CSV",
            name: "presupuesto_chile.csv",
          },
        ],
      },
      {
        id: "datos-gob-cl:educacion-2024",
        catalogId: "datos-gob-cl",
        externalId: "educacion-2024",
        title: "Estadísticas de educación Chile",
        description: "Matrícula y establecimientos educacionales",
        organization: "Ministerio de Educación",
        tags: ["educación"],
        resources: [
          {
            id: "cl-r2",
            datasetId: "datos-gob-cl:educacion-2024",
            url: `${baseUrl}/cl-educacion.csv`,
            format: "CSV",
            name: "educacion.csv",
          },
        ],
      },
    ],
  };
}

describe("Integration: Multi-catalog runtime", () => {
  let tmpDir: string;
  let client: Client;
  let server: McpServer;
  let httpServer: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // HTTP server for health checks
    httpServer = createServer((req, res) => {
      if (req.url?.startsWith("/ar-")) {
        res.writeHead(200, { "Content-Type": "text/csv", "Content-Length": "50" });
        res.end();
      } else if (req.url?.startsWith("/cl-presupuesto")) {
        res.writeHead(200, { "Content-Type": "text/csv", "Content-Length": "80" });
        res.end();
      } else if (req.url?.startsWith("/cl-educacion")) {
        res.writeHead(404);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = httpServer.address();
    if (typeof addr === "object" && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }

    // Temp directory with seeded metadata for both catalogs
    tmpDir = await mkdtemp(join(tmpdir(), "agora-multi-"));
    const dataDir = join(tmpDir, "data");
    const cacheDir = join(tmpDir, "cache");
    await mkdir(join(dataDir, "metadata"), { recursive: true });

    const datasets = makeDatasets(baseUrl);

    // Seed AR catalog cache
    await writeFile(
      join(dataDir, "metadata", "datos-gob-ar.json"),
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        catalogId: "datos-gob-ar",
        datasets: datasets.ar,
      }),
    );

    // Seed CL catalog cache
    await writeFile(
      join(dataDir, "metadata", "datos-gob-cl.json"),
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        catalogId: "datos-gob-cl",
        datasets: datasets.cl,
      }),
    );

    const config: Config = {
      dataDir,
      cacheDir,
      logLevel: "warn",
      metadataTtlHours: 24,
      presets: [],
      catalogIds: ["datos-gob-ar", "datos-gob-cl"],
      embeddingBatchSize: 64,
      queryTimeoutMs: 60_000,
      maxFileSizeBytes: 200 * 1024 * 1024,
    };

    const logger = createLogger(config.logLevel);
    const registry = new CatalogRegistry([CATALOG_AR, CATALOG_CL], logger);

    // FTS indexes — one per catalog
    const ftsIndexes = new Map<string, DuckDbFtsIndex>();
    ftsIndexes.set(
      "datos-gob-ar",
      new DuckDbFtsIndex("datos-gob-ar", "es", "AR", dataDir, logger),
    );
    ftsIndexes.set(
      "datos-gob-cl",
      new DuckDbFtsIndex("datos-gob-cl", "es", "CL", dataDir, logger),
    );

    // No embedder — FTS only
    const ingestion = new IngestionService(registry, config, logger, ftsIndexes);
    await ingestion.initialize();

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
    registerTools(server, logger, registry, ingestion, searchEngine, analysisEngine, healthCache);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    await server?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }, 15_000);

  // --- Ingestion ---

  it("listar_catalogos shows both catalogs with dataset counts", async () => {
    const result = await client.callTool({ name: "listar_catalogos", arguments: {} });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("Catálogos disponibles (2)");
    expect(text).toContain("datos-gob-ar");
    expect(text).toContain("datos-gob-cl");
    expect(text).toContain("Datasets: 2");
  });

  // --- Cross-catalog search ---

  it("cross-catalog search returns results from both catalogs", async () => {
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "presupuesto", limite: 10 },
    });
    const text = (result.content as TextContent[])[0].text;

    // Should find presupuesto datasets from both AR and CL
    expect(text).toContain("Presupuesto Nacional 2024");
    expect(text).toContain("Presupuesto de Chile 2024");
  });

  it("cross-catalog results show catalog origin", async () => {
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "presupuesto", limite: 10 },
    });
    const text = (result.content as TextContent[])[0].text;

    // Multi-catalog results should show catalog name
    expect(text).toContain("Catálogo:");
    expect(text).toContain("datos.gob.ar");
    expect(text).toContain("datos.gob.cl");
  });

  it("catalog filter restricts results to one catalog", async () => {
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "presupuesto", catalogo: "datos-gob-cl", limite: 10 },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("Presupuesto de Chile");
    expect(text).not.toContain("Presupuesto Nacional 2024");
    // Single catalog — should NOT show catalog origin
    expect(text).not.toContain("Catálogo:");
  });

  it("search for catalog-specific content only returns that catalog", async () => {
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "educación chile", limite: 10 },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("educación");
  });

  // --- Dataset info cross-catalog ---

  it("info_dataset works for AR catalog", async () => {
    const result = await client.callTool({
      name: "info_dataset",
      arguments: { id: "datos-gob-ar:presupuesto-2024" },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("Presupuesto Nacional 2024");
    expect(text).toContain("datos-gob-ar");
  });

  it("info_dataset works for CL catalog", async () => {
    const result = await client.callTool({
      name: "info_dataset",
      arguments: { id: "datos-gob-cl:presupuesto-chile-2024" },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("Presupuesto de Chile 2024");
    expect(text).toContain("datos-gob-cl");
  });

  // --- Health checks cross-catalog ---

  it("verificar_recursos works for AR dataset", async () => {
    const result = await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:presupuesto-2024" },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("[OK]");
    expect(text).toContain("1 accesible(s), 0 inaccesible(s)");
  });

  it("verificar_recursos works for CL dataset with mixed accessibility", async () => {
    const result = await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-cl:educacion-2024" },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("[FALLA]");
    expect(text).toContain("0 accesible(s), 1 inaccesible(s)");
  });

  it("cross-catalog search shows health annotations from both catalogs", async () => {
    // Verify datasets from both catalogs to populate health cache
    await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:presupuesto-2024" },
    });
    await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-cl:presupuesto-chile-2024" },
    });

    // Cross-catalog search should annotate results from both
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "presupuesto", limite: 10 },
    });
    const text = (result.content as TextContent[])[0].text;

    // Both presupuesto datasets should have "Accesible" annotation
    const accesibleCount = (text.match(/Accesible/g) || []).length;
    expect(accesibleCount).toBeGreaterThanOrEqual(2);
  });

  // --- Edge cases ---

  it("search with no results returns empty message", async () => {
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "xyznonexistent12345", limite: 5 },
    });
    const text = (result.content as TextContent[])[0].text;

    expect(text).toContain("No se encontraron");
  });

  it("info_dataset returns error for nonexistent dataset", async () => {
    const result = await client.callTool({
      name: "info_dataset",
      arguments: { id: "datos-gob-cl:nonexistent" },
    });

    expect(result.isError).toBe(true);
  });
});
