import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCatalogs, getCatalogById, getMeta, getGlobalStats } from "./data";

// Mock fs to avoid depending on actual data files
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "fs/promises";
const mockReadFile = vi.mocked(readFile);

const SAMPLE_CATALOGS = {
  generatedAt: "2026-03-23T10:00:00Z",
  catalogs: [
    {
      id: "datos-gob-ar",
      name: "datos.gob.ar",
      url: "https://datos.gob.ar",
      protocol: "ckan",
      country: "AR",
      language: "es",
      datasetCount: 1000,
      resourceCount: 4000,
      scores: { overall: 0.6, accessibility: 0.7, structure: 0.5, freshness: 0.4, completeness: 0.8, usability: 0 },
      stats: { accessiblePct: 0.7, medianFreshnessDays: 180, topFormats: [] },
      scoredAt: "2026-03-23T10:00:00Z",
    },
    {
      id: "data-gov-uk",
      name: "data.gov.uk",
      url: "https://data.gov.uk",
      protocol: "ckan",
      country: "GB",
      language: "en",
      datasetCount: 500,
      resourceCount: 2000,
      scores: { overall: 0.8, accessibility: 0.9, structure: 0.7, freshness: 0.6, completeness: 0.9, usability: 0 },
      stats: { accessiblePct: 0.9, medianFreshnessDays: 90, topFormats: [] },
      scoredAt: "2026-03-23T10:00:00Z",
    },
  ],
};

const SAMPLE_META = {
  version: "0.0.1",
  startedAt: "2026-03-23T09:00:00Z",
  completedAt: "2026-03-23T10:00:00Z",
  durationMs: 3600000,
  catalogsProcessed: 2,
  catalogsFailed: 0,
  totalDatasets: 1500,
  totalResources: 6000,
  config: { concurrency: 5, headTimeoutMs: 10000, freshnessHalfLifeDays: 180, accessibilitySampleSize: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockImplementation(async (path) => {
    const p = String(path);
    if (p.endsWith("catalogs.json")) return JSON.stringify(SAMPLE_CATALOGS);
    if (p.endsWith("meta.json")) return JSON.stringify(SAMPLE_META);
    throw new Error(`Unexpected file: ${p}`);
  });
});

describe("getCatalogs", () => {
  it("returns parsed catalog summaries", async () => {
    const catalogs = await getCatalogs();
    expect(catalogs).toHaveLength(2);
    expect(catalogs[0].id).toBe("datos-gob-ar");
    expect(catalogs[1].id).toBe("data-gov-uk");
  });
});

describe("getCatalogById", () => {
  it("finds catalog by id", async () => {
    const cat = await getCatalogById("data-gov-uk");
    expect(cat?.name).toBe("data.gov.uk");
  });

  it("returns undefined for unknown id", async () => {
    const cat = await getCatalogById("nonexistent");
    expect(cat).toBeUndefined();
  });
});

describe("getMeta", () => {
  it("returns pipeline metadata", async () => {
    const meta = await getMeta();
    expect(meta.catalogsProcessed).toBe(2);
    expect(meta.version).toBe("0.0.1");
  });
});

describe("getGlobalStats", () => {
  it("computes aggregate stats", async () => {
    const stats = await getGlobalStats();
    expect(stats.catalogCount).toBe(2);
    expect(stats.totalDatasets).toBe(1500);
    expect(stats.totalResources).toBe(6000);
    expect(stats.avgOverall).toBeCloseTo(0.7);
    expect(stats.avgAccessibility).toBeCloseTo(0.8);
  });
});
