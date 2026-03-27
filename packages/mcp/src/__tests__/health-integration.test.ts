/**
 * Integration test for health check flow:
 * buscar_datasets → verificar_recursos → buscar_datasets with annotations
 *
 * Uses a local HTTP server to control resource accessibility.
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

type TextContent = { type: string; text: string };

let httpServer: Server;
let baseUrl: string;

function fakeDatasets(base: string) {
  return [
    {
      id: "datos-gob-ar:siniestros-viales-2023",
      catalogId: "datos-gob-ar",
      externalId: "siniestros-viales-2023",
      title: "Siniestros viales 2023",
      description: "Datos de siniestros viales en Argentina",
      organization: "ANSV",
      tags: ["siniestros", "viales", "transporte"],
      resources: [
        {
          id: "r1",
          datasetId: "datos-gob-ar:siniestros-viales-2023",
          url: `${base}/accessible.csv`,
          format: "CSV",
          name: "siniestros_2023.csv",
        },
        {
          id: "r2",
          datasetId: "datos-gob-ar:siniestros-viales-2023",
          url: `${base}/forbidden.csv`,
          format: "CSV",
          name: "detalle_victimas.csv",
        },
      ],
    },
    {
      id: "datos-gob-ar:transporte-publico",
      catalogId: "datos-gob-ar",
      externalId: "transporte-publico",
      title: "Transporte público AMBA",
      description: "Datos de transporte público del área metropolitana",
      organization: "Ministerio de Transporte",
      tags: ["transporte", "colectivos", "subte"],
      resources: [
        {
          id: "r3",
          datasetId: "datos-gob-ar:transporte-publico",
          url: `${base}/accessible.csv`,
          format: "CSV",
          name: "lineas_colectivo.csv",
        },
      ],
    },
  ];
}

describe("Integration: Health check flow", () => {
  let tmpDir: string;
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    // Start HTTP server with controlled responses
    httpServer = createServer((req, res) => {
      if (req.url === "/accessible.csv") {
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": "100",
        });
        res.end();
      } else if (req.url === "/forbidden.csv") {
        res.writeHead(403);
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

    // Set up temp directory
    tmpDir = await mkdtemp(join(tmpdir(), "agora-health-int-"));
    const dataDir = join(tmpDir, "data");
    const cacheDir = join(tmpDir, "cache");
    await mkdir(join(dataDir, "metadata"), { recursive: true });

    const datasets = fakeDatasets(baseUrl);
    await writeFile(
      join(dataDir, "metadata", "datos-gob-ar.json"),
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        catalogId: "datos-gob-ar",
        datasets,
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

    const ftsIndexes = new Map<string, DuckDbFtsIndex>();
    ftsIndexes.set(
      "datos-gob-ar",
      new DuckDbFtsIndex("datos-gob-ar", "es", "AR", dataDir, logger),
    );

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

  it("verificar_recursos reports accessible and inaccessible resources", async () => {
    const result = await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:siniestros-viales-2023" },
    });

    const text = (result.content as TextContent[])[0].text;
    expect(text).toContain("[OK]");
    expect(text).toContain("[FALLA]");
    expect(text).toContain("HTTP 200");
    expect(text).toContain("HTTP 403");
    expect(text).toContain("1 accesible(s), 1 inaccesible(s)");
  });

  it("verificar_recursos returns error for unknown dataset", async () => {
    const result = await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:nonexistent" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as TextContent[])[0].text;
    expect(text).toContain("no encontrado");
  });

  it("verificar_recursos shows all-OK for fully accessible dataset", async () => {
    const result = await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:transporte-publico" },
    });

    const text = (result.content as TextContent[])[0].text;
    expect(text).toContain("[OK]");
    expect(text).not.toContain("[FALLA]");
    expect(text).toContain("1 accesible(s), 0 inaccesible(s)");
  });

  it("buscar_datasets shows health annotations after verification", async () => {
    // First verify a dataset (populates cache)
    await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:siniestros-viales-2023" },
    });

    // Now search — results should show accessibility annotations
    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "siniestros viales", limite: 5 },
    });

    const text = (result.content as TextContent[])[0].text;
    expect(text).toContain("Siniestros viales");
    // The dataset has 1/2 accessible resources
    expect(text).toContain("1/2 accesibles");
  });

  it("buscar_datasets shows 'Accesible' for fully OK dataset", async () => {
    // Verify the all-OK dataset
    await client.callTool({
      name: "verificar_recursos",
      arguments: { id: "datos-gob-ar:transporte-publico" },
    });

    const result = await client.callTool({
      name: "buscar_datasets",
      arguments: { query: "transporte", limite: 5 },
    });

    const text = (result.content as TextContent[])[0].text;
    expect(text).toContain("Transporte público");
    expect(text).toContain("Accesible");
  });
});
