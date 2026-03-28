import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Catalog, DatasetRecord } from "@agora/sdk";
import type { CatalogAdapter, CatalogEntry } from "agora-mcp/lib";
import { runPipeline } from "./pipeline.js";
import type { PipelineConfig } from "./config.js";
import type { CatalogsOutput, CatalogScores, PipelineMeta } from "@agora/sdk";

// ── Local HTTP server for accessibility checks ──

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case "/ok.csv":
        res.writeHead(200);
        break;
      case "/ok.json":
        res.writeHead(200);
        break;
      case "/redirect.csv":
        res.writeHead(301, { Location: "/ok.csv" });
        break;
      case "/broken.csv":
        res.writeHead(404);
        break;
      default:
        res.writeHead(200);
        break;
    }
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(() => {
  server?.close();
});

// ── Mock adapter ──

function createMockAdapter(catalogId: string, datasets: DatasetRecord[]): CatalogAdapter {
  const catalog: Catalog = {
    id: catalogId,
    name: `Mock ${catalogId}`,
    url: "https://mock.example.com",
    type: "ckan",
    enabled: true,
  };

  return {
    catalog,
    async *listDatasets() {
      for (const ds of datasets) {
        yield ds;
      }
    },
    async getDataset(externalId: string) {
      return datasets.find((d) => d.externalId === externalId) ?? null;
    },
  };
}

function createMockEntry(catalogId: string): CatalogEntry {
  return {
    id: catalogId,
    name: `Mock ${catalogId}`,
    url: "https://mock.example.com",
    protocol: "ckan",
    language: "es",
    country: "AR",
    tags: ["test"],
  };
}

// ── Tests ──

let outputDir: string;

beforeEach(() => {
  outputDir = join(tmpdir(), `agora-pipeline-test-${Date.now()}`);
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    outputDir,
    concurrency: 5,
    headTimeoutMs: 2000,
    logLevel: "error", // suppress logs in tests
    presets: [],
    catalogIds: [],
    freshnessHalfLifeDays: 180,
    accessibilitySampleSize: 0, // 0 = check all
    ckanPageSize: 25,
    budgetMin: 50,
    priorityPresets: ["all"],
    detailPresets: [],
    rescoreDays: 7,
    chunkSize: 0, // 0 = unlimited in tests
    catalogTimeoutMin: 15,
    ...overrides,
  };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("Pipeline integration", () => {
  it("scores a catalog and writes output files", async () => {
    const datasets: DatasetRecord[] = [
      {
        id: "mock:ds1",
        catalogId: "mock-catalog",
        externalId: "ds1",
        title: "Presupuesto Nacional 2024",
        description: "Datos detallados del presupuesto nacional por partida.",
        organization: "Ministerio de Economía",
        tags: ["presupuesto", "finanzas"],
        license: "CC-BY-4.0",
        resources: [
          { id: "r1", datasetId: "mock:ds1", url: `${baseUrl}/ok.csv`, format: "CSV" },
          { id: "r2", datasetId: "mock:ds1", url: `${baseUrl}/ok.json`, format: "JSON" },
        ],
        createdAt: "2024-01-01T00:00:00Z",
        modifiedAt: new Date().toISOString(),
      },
      {
        id: "mock:ds2",
        catalogId: "mock-catalog",
        externalId: "ds2",
        title: "Datos varios",
        description: "Sin detalle.",
        tags: [],
        resources: [
          { id: "r3", datasetId: "mock:ds2", url: `${baseUrl}/broken.csv`, format: "CSV" },
        ],
      },
    ];

    const adapter = createMockAdapter("mock-catalog", datasets);
    const entry = createMockEntry("mock-catalog");
    const config = makeConfig();

    await runPipeline(config, {
      adapters: [{ adapter, entry }],
      logger: silentLogger,
    });

    // Verify catalogs.json
    const catalogsRaw = await readFile(join(outputDir, "catalogs.json"), "utf-8");
    const catalogs: CatalogsOutput = JSON.parse(catalogsRaw);
    expect(catalogs.catalogs).toHaveLength(1);
    const summary = catalogs.catalogs[0];
    expect(summary.id).toBe("mock-catalog");
    expect(summary.datasetCount).toBe(2);
    expect(summary.scores.overall).toBeGreaterThan(0);
    expect(summary.scores.completeness).toBeGreaterThan(0);
    expect(summary.scores.structure).toBeGreaterThan(0);
    expect(summary.scores.accessibility).toBeGreaterThan(0);
    expect(summary.stats.topFormats[0].format).toBe("CSV");

    // Verify per-catalog scores.json
    const scoresRaw = await readFile(
      join(outputDir, "catalogs", "mock-catalog", "scores.json"),
      "utf-8",
    );
    const scores: CatalogScores = JSON.parse(scoresRaw);
    expect(scores.catalogId).toBe("mock-catalog");
    expect(scores.datasetCount).toBe(2);
    expect(scores.datasets).toHaveLength(2);

    // Each dataset should have 4 dimensions
    for (const ds of scores.datasets) {
      expect(ds.dimensions).toHaveLength(4);
      const dims = ds.dimensions.map((d) => d.dimension).sort();
      expect(dims).toEqual(["accessibility", "completeness", "freshness", "structure"]);
      expect(ds.overall).toBeGreaterThanOrEqual(0);
      expect(ds.overall).toBeLessThanOrEqual(1);
    }

    // Verify meta.json
    const metaRaw = await readFile(join(outputDir, "meta.json"), "utf-8");
    const meta: PipelineMeta = JSON.parse(metaRaw);
    expect(meta.catalogsProcessed).toBe(1);
    expect(meta.catalogsFailed).toBe(0);
    expect(meta.totalDatasets).toBe(2);
    expect(meta.totalResources).toBeGreaterThanOrEqual(0);
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("scores all datasets with accessibility in detail tier", async () => {
    const datasets: DatasetRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `mock:ds${i}`,
      catalogId: "mock-catalog",
      externalId: `ds${i}`,
      title: `Dataset ${i}`,
      tags: [],
      resources: [
        { id: `r${i}`, datasetId: `mock:ds${i}`, url: `${baseUrl}/ok.csv`, format: "CSV" },
      ],
    }));

    const adapter = createMockAdapter("mock-catalog", datasets);
    const entry = createMockEntry("mock-catalog");
    const config = makeConfig();

    await runPipeline(config, {
      adapters: [{ adapter, entry }],
      logger: silentLogger,
    });

    const scoresRaw = await readFile(
      join(outputDir, "catalogs", "mock-catalog", "scores.json"),
      "utf-8",
    );
    const scores: CatalogScores = JSON.parse(scoresRaw);
    expect(scores.datasets).toHaveLength(5);

    // All should have accessibility dimension (detail tier scores all individually)
    for (const ds of scores.datasets) {
      const accDim = ds.dimensions.find((d) => d.dimension === "accessibility");
      expect(accDim).toBeDefined();
      expect(accDim!.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles empty catalog", async () => {
    const adapter = createMockAdapter("empty-catalog", []);
    const entry = createMockEntry("empty-catalog");
    entry.id = "empty-catalog";
    entry.name = "Empty";
    const config = makeConfig();

    await runPipeline(config, {
      adapters: [{ adapter, entry }],
      logger: silentLogger,
    });

    const catalogsRaw = await readFile(join(outputDir, "catalogs.json"), "utf-8");
    const catalogs: CatalogsOutput = JSON.parse(catalogsRaw);
    expect(catalogs.catalogs[0].datasetCount).toBe(0);
    expect(catalogs.catalogs[0].scores.overall).toBe(0);
  });

  it("processes multiple catalogs", async () => {
    const ds1: DatasetRecord = {
      id: "cat1:ds1",
      catalogId: "catalog-1",
      externalId: "ds1",
      title: "Dataset 1",
      tags: ["test"],
      resources: [
        { id: "r1", datasetId: "cat1:ds1", url: `${baseUrl}/ok.csv`, format: "CSV" },
      ],
      modifiedAt: new Date().toISOString(),
    };
    const ds2: DatasetRecord = {
      id: "cat2:ds1",
      catalogId: "catalog-2",
      externalId: "ds1",
      title: "Dataset 2",
      tags: [],
      resources: [
        { id: "r1", datasetId: "cat2:ds1", url: `${baseUrl}/redirect.csv`, format: "CSV" },
      ],
    };

    const config = makeConfig();

    await runPipeline(config, {
      adapters: [
        { adapter: createMockAdapter("catalog-1", [ds1]), entry: createMockEntry("catalog-1") },
        { adapter: createMockAdapter("catalog-2", [ds2]), entry: createMockEntry("catalog-2") },
      ],
      logger: silentLogger,
    });

    const catalogsRaw = await readFile(join(outputDir, "catalogs.json"), "utf-8");
    const catalogs: CatalogsOutput = JSON.parse(catalogsRaw);
    expect(catalogs.catalogs).toHaveLength(2);

    // Both catalogs should have per-catalog scores
    const s1 = await readFile(
      join(outputDir, "catalogs", "catalog-1", "scores.json"),
      "utf-8",
    );
    const s2 = await readFile(
      join(outputDir, "catalogs", "catalog-2", "scores.json"),
      "utf-8",
    );
    expect(JSON.parse(s1).catalogId).toBe("catalog-1");
    expect(JSON.parse(s2).catalogId).toBe("catalog-2");
  });

  it("continues when one catalog fails", async () => {
    const goodDataset: DatasetRecord = {
      id: "good:ds1",
      catalogId: "good-catalog",
      externalId: "ds1",
      title: "Good Dataset",
      tags: [],
      resources: [
        { id: "r1", datasetId: "good:ds1", url: `${baseUrl}/ok.csv`, format: "CSV" },
      ],
    };

    // Failing adapter
    const failingAdapter: CatalogAdapter = {
      catalog: { id: "bad-catalog", name: "Bad", url: "https://bad.example.com", type: "ckan", enabled: true },
      async *listDatasets() {
        yield* []; // eslint: require-yield
        throw new Error("API unavailable");
      },
      async getDataset() {
        return null;
      },
    };

    const config = makeConfig();

    await runPipeline(config, {
      adapters: [
        { adapter: failingAdapter, entry: createMockEntry("bad-catalog") },
        { adapter: createMockAdapter("good-catalog", [goodDataset]), entry: createMockEntry("good-catalog") },
      ],
      logger: silentLogger,
    });

    const metaRaw = await readFile(join(outputDir, "meta.json"), "utf-8");
    const meta: PipelineMeta = JSON.parse(metaRaw);
    expect(meta.catalogsProcessed).toBe(1);
    expect(meta.catalogsFailed).toBe(1);

    const catalogsRaw = await readFile(join(outputDir, "catalogs.json"), "utf-8");
    const catalogs: CatalogsOutput = JSON.parse(catalogsRaw);
    // good-catalog succeeded, bad-catalog may appear as fallback
    const goodCatalog = catalogs.catalogs.find((c) => c.id === "good-catalog");
    expect(goodCatalog).toBeDefined();
    expect(goodCatalog!.scores.overall).toBeGreaterThan(0);
  });

  it("computes correct accessibility stats", async () => {
    const datasets: DatasetRecord[] = [
      {
        id: "mock:ds1",
        catalogId: "mock-catalog",
        externalId: "ds1",
        title: "Dataset with mixed resources",
        tags: [],
        resources: [
          { id: "r1", datasetId: "mock:ds1", url: `${baseUrl}/ok.csv`, format: "CSV" },
          { id: "r2", datasetId: "mock:ds1", url: `${baseUrl}/broken.csv`, format: "CSV" },
        ],
      },
    ];

    const adapter = createMockAdapter("mock-catalog", datasets);
    const entry = createMockEntry("mock-catalog");
    const config = makeConfig();

    await runPipeline(config, {
      adapters: [{ adapter, entry }],
      logger: silentLogger,
    });

    const catalogsRaw = await readFile(join(outputDir, "catalogs.json"), "utf-8");
    const catalogs: CatalogsOutput = JSON.parse(catalogsRaw);
    // 1 accessible out of 2 checked = 50%
    expect(catalogs.catalogs[0].stats.accessiblePct).toBe(0.5);
  });
});
