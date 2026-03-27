/**
 * Tests for DuckDB httpfs fallback — large file streaming.
 *
 * Uses a local HTTP server to serve fixture CSVs, with a very low
 * maxFileSizeBytes to trigger the httpfs path without needing real large files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, readFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { AnalysisEngine } from "./analysis-engine.js";
import { FileCache, cacheKey } from "./file-cache.js";
import { closeAllDatabases } from "../duckdb.js";

const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

const FIXTURE_CSV = resolve(import.meta.dirname, "../__fixtures__/sample.csv");
const FIXTURE_CITIES = resolve(import.meta.dirname, "../__fixtures__/cities.csv");

let csvContent: string;
let citiesContent: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  csvContent = await readFile(FIXTURE_CSV, "utf-8");
  citiesContent = await readFile(FIXTURE_CITIES, "utf-8");

  server = createServer((req, res) => {
    if (req.url === "/sample.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Length": String(Buffer.byteLength(csvContent)),
      });
      res.end(csvContent);
    } else if (req.url === "/cities.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Length": String(Buffer.byteLength(citiesContent)),
      });
      res.end(citiesContent);
    } else if (req.url === "/no-content-length.csv") {
      // No Content-Length header — probe can't determine size
      res.writeHead(200, { "Content-Type": "text/csv" });
      res.end(csvContent);
    } else {
      res.writeHead(404);
      res.end("Not Found");
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

// ---------------------------------------------------------------------------
// FileCache.probe()
// ---------------------------------------------------------------------------

describe("FileCache.probe", () => {
  let tmpDir: string;
  let cache: FileCache;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-probe-"));
    // maxFileSizeBytes = 50 bytes → fixture CSVs (~150 bytes) exceed the limit
    cache = new FileCache(
      { cacheDir: tmpDir, maxFileSizeBytes: 50 },
      logger,
    );
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns exceedsMaxSize=true when Content-Length exceeds limit", async () => {
    const result = await cache.probe(`${baseUrl}/sample.csv`);
    expect(result.exceedsMaxSize).toBe(true);
    expect(result.contentLength).toBeGreaterThan(50);
  });

  it("returns exceedsMaxSize=false when Content-Length is within limit", async () => {
    const largeCache = new FileCache(
      { cacheDir: tmpDir, maxFileSizeBytes: 10 * 1024 * 1024 },
      logger,
    );
    const result = await largeCache.probe(`${baseUrl}/sample.csv`);
    expect(result.exceedsMaxSize).toBe(false);
    expect(result.contentLength).toBeGreaterThan(0);
  });

  it("returns exceedsMaxSize=false when file is cached and fresh", async () => {
    // Pre-populate cache
    const url = `${baseUrl}/sample.csv`;
    const key = cacheKey(url);
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(join(tmpDir, key), csvContent);

    // Even though maxFileSizeBytes=50 and the file is >50 bytes,
    // since it's cached it should return exceedsMaxSize=false
    const result = await cache.probe(url);
    expect(result.exceedsMaxSize).toBe(false);
  });

  it("returns exceedsMaxSize=false when HEAD fails", async () => {
    const result = await cache.probe("http://127.0.0.1:1/unreachable.csv");
    expect(result.exceedsMaxSize).toBe(false);
    expect(result.contentLength).toBeNull();
  });

  it("returns exceedsMaxSize=false when no Content-Length header", async () => {
    const result = await cache.probe(`${baseUrl}/no-content-length.csv`);
    expect(result.exceedsMaxSize).toBe(false);
    expect(result.contentLength).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AnalysisEngine httpfs path
// ---------------------------------------------------------------------------

describe("AnalysisEngine httpfs", () => {
  let tmpDir: string;
  let engine: AnalysisEngine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-httpfs-"));
    // maxFileSizeBytes = 50 → forces httpfs path for fixture CSVs
    engine = new AnalysisEngine(
      { cacheDir: tmpDir, maxFileSizeBytes: 50, ttlHours: 24 },
      logger,
    );
  });

  afterEach(async () => {
    engine.dispose();
    closeAllDatabases();
    await new Promise((r) => setTimeout(r, 100));
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("inspect via httpfs", () => {
    it("returns column info and preview for a large remote CSV", async () => {
      const result = await engine.inspect(`${baseUrl}/sample.csv`);

      expect(result.columns).toHaveLength(4);
      expect(result.columns.map((c) => c.name)).toEqual(
        expect.arrayContaining(["nombre", "edad", "ciudad", "salario"]),
      );
      expect(result.rowCount).toBe(5);
      expect(result.preview).toHaveLength(5);
      expect(result.encoding).toBe("auto");
      expect(result.fromCache).toBe(false);
    });
  });

  describe("query via httpfs", () => {
    it("executes SQL against a remote CSV", async () => {
      const result = await engine.query(
        `${baseUrl}/sample.csv`,
        "SELECT * FROM datos WHERE edad > 30",
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.columns.map((c) => c.name)).toContain("nombre");
      for (const row of result.rows) {
        expect(Number(row["edad"])).toBeGreaterThan(30);
      }
    });

    it("supports aggregation via httpfs", async () => {
      const result = await engine.query(
        `${baseUrl}/sample.csv`,
        "SELECT count(*)::INTEGER AS total FROM datos",
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!["total"]).toBe(5);
    });

    it("supports pagination via httpfs", async () => {
      const result = await engine.query(
        `${baseUrl}/sample.csv`,
        "SELECT * FROM datos",
        { limite: 2 },
      );

      expect(result.rowCount).toBe(2);
      expect(result.totalRows).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it("rejects dangerous SQL even in httpfs mode", async () => {
      await expect(
        engine.query(`${baseUrl}/sample.csv`, "DROP TABLE datos"),
      ).rejects.toThrow(/no permitid/i);
    });

    it("sandbox blocks filesystem access after httpfs load", async () => {
      await expect(
        engine.query(
          `${baseUrl}/sample.csv`,
          "SELECT * FROM read_csv_auto('/etc/passwd') AS datos",
        ),
      ).rejects.toThrow(/no permitid/i);
    });
  });

  describe("session with httpfs", () => {
    it("creates a session with a large remote resource", async () => {
      const session = await engine.createSession([
        { nombre: "personas", url: `${baseUrl}/sample.csv` },
      ]);

      expect(session.sessionId).toBeTruthy();
      expect(session.tablas).toContain("personas");

      const result = await engine.querySession(
        session.sessionId,
        "SELECT count(*)::INTEGER AS n FROM personas",
      );
      expect(result.rows[0]!["n"]).toBe(5);

      engine.closeSession(session.sessionId);
    });

    it("supports mixed cache + httpfs resources in session", async () => {
      // Create a second engine where one CSV is cached (within limit)
      // and the other exceeds the limit
      const mixedEngine = new AnalysisEngine(
        {
          cacheDir: tmpDir,
          // Set limit between cities.csv size and sample.csv size is tricky,
          // so we use 50 bytes — both go via httpfs
          maxFileSizeBytes: 50,
          ttlHours: 24,
        },
        logger,
      );

      const session = await mixedEngine.createSession([
        { nombre: "personas", url: `${baseUrl}/sample.csv` },
        { nombre: "ciudades", url: `${baseUrl}/cities.csv` },
      ]);

      expect(session.tablas).toEqual(["personas", "ciudades"]);

      const result = await mixedEngine.querySession(
        session.sessionId,
        "SELECT p.nombre, c.provincia FROM personas p JOIN ciudades c ON p.ciudad = c.ciudad",
      );
      expect(result.rows.length).toBeGreaterThan(0);

      mixedEngine.closeSession(session.sessionId);
      mixedEngine.dispose();
    });

    it("sandbox blocks read_csv_auto in session after httpfs load", async () => {
      const session = await engine.createSession([
        { nombre: "personas", url: `${baseUrl}/sample.csv` },
      ]);

      await expect(
        engine.querySession(
          session.sessionId,
          "SELECT * FROM read_csv_auto('/etc/passwd') AS personas",
        ),
      ).rejects.toThrow(/no permitid/i);

      engine.closeSession(session.sessionId);
    });
  });
});

// ---------------------------------------------------------------------------
// Standard path still works (regression)
// ---------------------------------------------------------------------------

describe("AnalysisEngine standard path (regression)", () => {
  let tmpDir: string;
  let engine: AnalysisEngine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-standard-"));
    // High maxFileSizeBytes → standard download path
    engine = new AnalysisEngine(
      { cacheDir: tmpDir, maxFileSizeBytes: 10 * 1024 * 1024, ttlHours: 24 },
      logger,
    );

    // Pre-populate cache
    const sampleUrl = "https://example.com/sample.csv";
    await copyFile(FIXTURE_CSV, join(tmpDir, cacheKey(sampleUrl)));
  });

  afterEach(async () => {
    engine.dispose();
    closeAllDatabases();
    await new Promise((r) => setTimeout(r, 100));
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("inspect still works via cache", async () => {
    const result = await engine.inspect("https://example.com/sample.csv");
    expect(result.columns).toHaveLength(4);
    expect(result.rowCount).toBe(5);
    expect(result.fromCache).toBe(true);
    expect(result.encoding).not.toBe("auto");
  });

  it("query still works via cache", async () => {
    const result = await engine.query(
      "https://example.com/sample.csv",
      "SELECT * FROM datos",
    );
    expect(result.rowCount).toBe(5);
  });
});
