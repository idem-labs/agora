import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeOutput } from "./writer.js";
import type { CatalogScores, CatalogsOutput, PipelineMeta } from "./types.js";

let outputDir: string;

beforeEach(() => {
  outputDir = join(tmpdir(), `agora-writer-test-${Date.now()}`);
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

const meta: PipelineMeta = {
  version: "0.0.1",
  startedAt: "2024-01-01T00:00:00Z",
  completedAt: "2024-01-01T00:05:00Z",
  durationMs: 300000,
  catalogsProcessed: 1,
  catalogsFailed: 0,
  totalDatasets: 2,
  totalResources: 3,
  config: {
    concurrency: 10,
    headTimeoutMs: 10000,
    freshnessHalfLifeDays: 180,
    accessibilitySampleSize: 200,
  },
};

const catalogs: CatalogsOutput = {
  generatedAt: "2024-01-01T00:05:00Z",
  catalogs: [
    {
      id: "test-catalog",
      name: "Test",
      url: "https://test.example.com",
      protocol: "ckan",
      country: "AR",
      language: "es",
      datasetCount: 2,
      resourceCount: 3,
      scores: {
        overall: 0.7,
        accessibility: 0.8,
        structure: 0.9,
        freshness: 0.6,
        completeness: 0.5,
        usability: 0,
      },
      stats: {
        accessiblePct: 0.8,
        medianFreshnessDays: 90,
        topFormats: [{ format: "CSV", count: 2 }],
      },
      scoredAt: "2024-01-01T00:05:00Z",
    },
  ],
};

const catalogScores: CatalogScores[] = [
  {
    catalogId: "test-catalog",
    scoredAt: "2024-01-01T00:05:00Z",
    datasetCount: 2,
    datasets: [
      {
        datasetId: "ds1",
        overall: 0.8,
        dimensions: [
          { dimension: "completeness", score: 0.7, calculatedAt: "2024-01-01T00:05:00Z" },
        ],
        lastChecked: "2024-01-01T00:05:00Z",
      },
    ],
  },
];

describe("writeOutput", () => {
  it("creates catalogs.json", async () => {
    await writeOutput({ outputDir, catalogs, catalogScores, meta });
    const content = JSON.parse(await readFile(join(outputDir, "catalogs.json"), "utf-8"));
    expect(content.generatedAt).toBe("2024-01-01T00:05:00Z");
    expect(content.catalogs).toHaveLength(1);
    expect(content.catalogs[0].id).toBe("test-catalog");
  });

  it("creates per-catalog scores.json", async () => {
    await writeOutput({ outputDir, catalogs, catalogScores, meta });
    const content = JSON.parse(
      await readFile(join(outputDir, "catalogs", "test-catalog", "scores.json"), "utf-8"),
    );
    expect(content.catalogId).toBe("test-catalog");
    expect(content.datasets).toHaveLength(1);
  });

  it("creates meta.json", async () => {
    await writeOutput({ outputDir, catalogs, catalogScores, meta });
    const content = JSON.parse(await readFile(join(outputDir, "meta.json"), "utf-8"));
    expect(content.version).toBe("0.0.1");
    expect(content.durationMs).toBe(300000);
    expect(content.config.concurrency).toBe(10);
  });

  it("handles multiple catalogs", async () => {
    const multiScores: CatalogScores[] = [
      { ...catalogScores[0] },
      { ...catalogScores[0], catalogId: "second-catalog" },
    ];
    await writeOutput({ outputDir, catalogs, catalogScores: multiScores, meta });
    const first = JSON.parse(
      await readFile(join(outputDir, "catalogs", "test-catalog", "scores.json"), "utf-8"),
    );
    const second = JSON.parse(
      await readFile(join(outputDir, "catalogs", "second-catalog", "scores.json"), "utf-8"),
    );
    expect(first.catalogId).toBe("test-catalog");
    expect(second.catalogId).toBe("second-catalog");
  });
});
