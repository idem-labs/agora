import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MetadataCache } from "./metadata-cache.js";
import type { DatasetRecord } from "@agora/sdk";
import type { Logger } from "./logger.js";

const noop = () => {};
const logger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

const CATALOG_ID = "datos-gob-ar";

const sampleRecords: DatasetRecord[] = [
  {
    id: "datos-gob-ar:presupuesto-2024",
    catalogId: CATALOG_ID,
    externalId: "presupuesto-2024",
    title: "Presupuesto Nacional 2024",
    tags: ["Presupuesto"],
    resources: [],
  },
  {
    id: "datos-gob-ar:censo-2022",
    catalogId: CATALOG_ID,
    externalId: "censo-2022",
    title: "Censo Nacional 2022",
    tags: [],
    resources: [],
  },
];

describe("MetadataCache", () => {
  let dataDir: string;
  let cache: MetadataCache;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "agora-test-"));
    cache = new MetadataCache(dataDir, logger);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns not-fresh when cache does not exist", async () => {
    expect(await cache.isFresh(CATALOG_ID, 24)).toBe(false);
  });

  it("saves and loads datasets", async () => {
    await cache.save(CATALOG_ID, sampleRecords);
    const loaded = await cache.load(CATALOG_ID);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("datos-gob-ar:presupuesto-2024");
    expect(loaded[1].title).toBe("Censo Nacional 2022");
  });

  it("reports fresh cache within TTL", async () => {
    await cache.save(CATALOG_ID, sampleRecords);
    expect(await cache.isFresh(CATALOG_ID, 24)).toBe(true);
  });

  it("reports stale cache when TTL is 0", async () => {
    await cache.save(CATALOG_ID, sampleRecords);
    // TTL of 0 hours → always stale (age >= 0 which is >= 0ms)
    expect(await cache.isFresh(CATALOG_ID, 0)).toBe(false);
  });

  it("throws when loading non-existent cache", async () => {
    await expect(cache.load("nonexistent")).rejects.toThrow();
  });

  it("creates directory structure on save", async () => {
    const deepDir = join(dataDir, "nested", "deep");
    const deepCache = new MetadataCache(deepDir, logger);

    await deepCache.save(CATALOG_ID, sampleRecords);
    const loaded = await deepCache.load(CATALOG_ID);

    expect(loaded).toHaveLength(2);
  });
});
