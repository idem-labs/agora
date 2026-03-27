import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HealthCache } from "./health-cache.js";

const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Length": "42",
      });
      res.end();
    } else if (req.url === "/forbidden.csv") {
      res.writeHead(403);
      res.end();
    } else if (req.url === "/not-found.csv") {
      res.writeHead(404);
      res.end();
    } else if (req.url === "/slow.csv") {
      // Never responds — will timeout
      // Don't call res.end()
    } else if (req.url === "/redirect.csv") {
      res.writeHead(301, { Location: `${baseUrl}/ok.csv` });
      res.end();
    } else {
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("HealthCache", () => {
  let tmpDir: string;
  let cache: HealthCache;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-health-"));
    cache = new HealthCache(
      { healthDir: tmpDir, healthTtlHours: 24, headTimeoutMs: 2000 },
      logger,
    );
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("check", () => {
    it("returns status 200 for accessible resource", async () => {
      const result = await cache.check("test-catalog", `${baseUrl}/ok.csv`);
      expect(result.status).toBe(200);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.contentLength).toBe(42);
      expect(result.contentType).toBe("text/csv");
      expect(result.checkedAt).toBeTruthy();
    });

    it("returns status 403 for forbidden resource", async () => {
      const result = await cache.check("test-catalog", `${baseUrl}/forbidden.csv`);
      expect(result.status).toBe(403);
    });

    it("returns status 404 for missing resource", async () => {
      const result = await cache.check("test-catalog", `${baseUrl}/not-found.csv`);
      expect(result.status).toBe(404);
    });

    it("returns status 0 for timeout/network error", async () => {
      const result = await cache.check("test-catalog", `${baseUrl}/slow.csv`);
      expect(result.status).toBe(0);
    });

    it("follows redirects", async () => {
      const result = await cache.check("test-catalog", `${baseUrl}/redirect.csv`);
      expect(result.status).toBe(200);
    });

    it("returns status 0 for unreachable host", async () => {
      const result = await cache.check("test-catalog", "http://127.0.0.1:1/nope.csv");
      expect(result.status).toBe(0);
    });
  });

  describe("caching", () => {
    it("persists results to disk", async () => {
      await cache.check("test-catalog", `${baseUrl}/ok.csv`);

      const filePath = join(tmpDir, "test-catalog.json");
      expect(existsSync(filePath)).toBe(true);

      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.resources[`${baseUrl}/ok.csv`]).toBeDefined();
      expect(data.resources[`${baseUrl}/ok.csv`].status).toBe(200);
    });

    it("returns cached result on second call", async () => {
      const first = await cache.check("test-catalog", `${baseUrl}/ok.csv`);
      const second = await cache.check("test-catalog", `${baseUrl}/ok.csv`);

      // Same checkedAt means it came from cache
      expect(second.checkedAt).toBe(first.checkedAt);
    });

    it("ignores stale cache entries", async () => {
      // TTL = 0 hours → everything is stale
      const staleCache = new HealthCache(
        { healthDir: tmpDir, healthTtlHours: 0, headTimeoutMs: 2000 },
        logger,
      );

      const first = await staleCache.check("test-catalog", `${baseUrl}/ok.csv`);
      // Small delay to get different checkedAt
      await new Promise((r) => setTimeout(r, 10));
      const second = await staleCache.check("test-catalog", `${baseUrl}/ok.csv`);

      expect(second.checkedAt).not.toBe(first.checkedAt);
    });
  });

  describe("checkMany", () => {
    it("checks multiple URLs in parallel", async () => {
      const urls = [
        `${baseUrl}/ok.csv`,
        `${baseUrl}/forbidden.csv`,
        `${baseUrl}/not-found.csv`,
      ];

      const results = await cache.checkMany("test-catalog", urls);

      expect(results.size).toBe(3);
      expect(results.get(`${baseUrl}/ok.csv`)!.status).toBe(200);
      expect(results.get(`${baseUrl}/forbidden.csv`)!.status).toBe(403);
      expect(results.get(`${baseUrl}/not-found.csv`)!.status).toBe(404);
    });

    it("uses cache for already-checked URLs", async () => {
      // Pre-check one URL
      await cache.check("test-catalog", `${baseUrl}/ok.csv`);

      const urls = [`${baseUrl}/ok.csv`, `${baseUrl}/forbidden.csv`];
      const results = await cache.checkMany("test-catalog", urls);

      expect(results.size).toBe(2);
      // Both should have results
      expect(results.get(`${baseUrl}/ok.csv`)!.status).toBe(200);
      expect(results.get(`${baseUrl}/forbidden.csv`)!.status).toBe(403);
    });
  });

  describe("getAllCached", () => {
    it("returns empty object when no data", () => {
      const result = cache.getAllCached("nonexistent");
      expect(result).toEqual({});
    });

    it("returns all cached entries for a catalog", async () => {
      await cache.check("test-catalog", `${baseUrl}/ok.csv`);
      await cache.check("test-catalog", `${baseUrl}/forbidden.csv`);

      const all = cache.getAllCached("test-catalog");
      expect(Object.keys(all)).toHaveLength(2);
    });
  });

  describe("eviction", () => {
    it("purges stale entries from disk on persist", async () => {
      // Use a very short TTL
      const shortCache = new HealthCache(
        { healthDir: tmpDir, healthTtlHours: 0, headTimeoutMs: 2000 },
        logger,
      );

      // Check a URL — it gets persisted
      await shortCache.check("evict-catalog", `${baseUrl}/ok.csv`);

      // Now check another URL — persist will evict the stale first entry
      await new Promise((r) => setTimeout(r, 10));
      await shortCache.check("evict-catalog", `${baseUrl}/forbidden.csv`);

      // Read persisted file — stale entry should be evicted
      const filePath = join(tmpDir, "evict-catalog.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));

      // Only the most recent entry should survive (forbidden was just written)
      // The ok.csv entry is stale (TTL=0) and should have been purged
      expect(data.resources[`${baseUrl}/ok.csv`]).toBeUndefined();
      expect(data.resources[`${baseUrl}/forbidden.csv`]).toBeDefined();
    });
  });
});
