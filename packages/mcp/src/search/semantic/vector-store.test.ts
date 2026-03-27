import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VectraVectorStore } from "./vector-store.js";
import type { Logger } from "../../logger.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

/** Create a simple unit vector with a peak at the given dimension. */
function makeVector(dims: number, peakIndex: number): number[] {
  const vec = new Array(dims).fill(0);
  vec[peakIndex] = 1.0;
  return vec;
}

describe("VectraVectorStore", () => {
  let indexDir: string;

  beforeEach(async () => {
    indexDir = await mkdtemp(join(tmpdir(), "agora-vector-"));
  });

  afterEach(async () => {
    await rm(indexDir, { recursive: true, force: true });
  });

  it("creates index on first initialize", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();
    expect(await store.itemCount()).toBe(0);
  });

  it("upsertAll + query round-trip", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    const items = [
      { id: "cat:a", catalogId: "cat", vector: makeVector(384, 0) },
      { id: "cat:b", catalogId: "cat", vector: makeVector(384, 1) },
      { id: "cat:c", catalogId: "cat", vector: makeVector(384, 2) },
    ];

    await store.upsertAll(items);
    expect(await store.itemCount()).toBe(3);

    // Query with vector similar to item "a"
    const results = await store.query(makeVector(384, 0), 3);
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("cat:a");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("query respects topK", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `cat:item-${i}`,
      catalogId: "cat",
      vector: makeVector(384, i),
    }));

    await store.upsertAll(items);

    const results = await store.query(makeVector(384, 0), 3);
    expect(results).toHaveLength(3);
  });

  it("query filters by catalogId", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    await store.upsertAll([
      { id: "alpha:1", catalogId: "alpha", vector: makeVector(384, 0) },
      { id: "beta:1", catalogId: "beta", vector: makeVector(384, 1) },
      { id: "alpha:2", catalogId: "alpha", vector: makeVector(384, 2) },
    ]);

    const results = await store.query(makeVector(384, 0), 10, "alpha");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.catalogId === "alpha")).toBe(true);
  });

  it("upsertAll is idempotent", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    const items = [
      { id: "cat:a", catalogId: "cat", vector: makeVector(384, 0) },
    ];

    await store.upsertAll(items);
    await store.upsertAll(items);

    expect(await store.itemCount()).toBe(1);
  });

  it("persists across instances", async () => {
    const store1 = new VectraVectorStore(indexDir, logger);
    await store1.initialize();
    await store1.upsertAll([
      { id: "cat:a", catalogId: "cat", vector: makeVector(384, 0) },
    ]);

    // New instance, same directory
    const store2 = new VectraVectorStore(indexDir, logger);
    await store2.initialize();

    expect(await store2.itemCount()).toBe(1);
    const results = await store2.query(makeVector(384, 0), 1);
    expect(results[0].id).toBe("cat:a");
  });

  it("query on empty index returns empty", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    const results = await store.query(makeVector(384, 0), 5);
    expect(results).toEqual([]);
  });

  it("upsertAll with empty array is no-op", async () => {
    const store = new VectraVectorStore(indexDir, logger);
    await store.initialize();

    await store.upsertAll([]);
    expect(await store.itemCount()).toBe(0);
  });
});
