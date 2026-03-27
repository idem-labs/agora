import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { AnalysisEngine } from "./analysis-engine.js";
import { cacheKey } from "./file-cache.js";
import { SqlSanitizationError } from "./sql-sanitizer.js";
import { closeAllDatabases } from "../duckdb.js";

const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

const FIXTURE_CSV = resolve(
  import.meta.dirname,
  "../__fixtures__/sample.csv",
);
const FIXTURE_CITIES = resolve(
  import.meta.dirname,
  "../__fixtures__/cities.csv",
);

const SAMPLE_URL = "https://example.com/sample.csv";
const CITIES_URL = "https://example.com/cities.csv";

describe("AnalysisEngine", () => {
  let tmpDir: string;
  let engine: AnalysisEngine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-analysis-"));
    engine = new AnalysisEngine(
      { cacheDir: tmpDir, ttlHours: 24 },
      logger,
    );

    // Pre-populate cache with our fixture CSVs
    await copyFile(FIXTURE_CSV, join(tmpDir, cacheKey(SAMPLE_URL)));
    await copyFile(FIXTURE_CITIES, join(tmpDir, cacheKey(CITIES_URL)));
  });

  afterEach(async () => {
    engine.dispose();
    closeAllDatabases();
    await new Promise((r) => setTimeout(r, 100));
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("inspect", () => {
    it("returns column info, row count, and preview", async () => {
      const result = await engine.inspect("https://example.com/sample.csv");

      expect(result.columns).toHaveLength(4);
      expect(result.columns.map((c) => c.name)).toEqual(
        expect.arrayContaining(["nombre", "edad", "ciudad", "salario"]),
      );
      expect(result.rowCount).toBe(5);
      expect(result.preview).toHaveLength(5);
      expect(result.preview[0]).toHaveProperty("nombre");
      expect(result.encoding).toBeTruthy();
      expect(result.fromCache).toBe(true);
    });

    it("detects numeric column types", async () => {
      const result = await engine.inspect("https://example.com/sample.csv");

      const edadCol = result.columns.find((c) => c.name === "edad");
      expect(edadCol?.type).toMatch(/BIGINT|INTEGER|INT/i);

      const salarioCol = result.columns.find((c) => c.name === "salario");
      expect(salarioCol?.type).toMatch(/BIGINT|INTEGER|INT/i);
    });
  });

  describe("query", () => {
    it("executes a simple SELECT", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT nombre, edad FROM datos WHERE edad > 30 ORDER BY edad",
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.columns.map((c) => c.name)).toEqual(["nombre", "edad"]);
      // All returned ages should be > 30
      for (const row of result.rows) {
        expect(Number(row["edad"])).toBeGreaterThan(30);
      }
    });

    it("executes aggregate queries", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT count(*) AS total, avg(salario) AS salario_promedio FROM datos",
      );

      expect(result.rows).toHaveLength(1);
      expect(Number(result.rows[0]!["total"])).toBe(5);
      expect(Number(result.rows[0]!["salario_promedio"])).toBeGreaterThan(0);
    });

    it("supports GROUP BY", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT ciudad, count(*) AS cnt FROM datos GROUP BY ciudad ORDER BY cnt DESC",
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty("ciudad");
      expect(result.rows[0]).toHaveProperty("cnt");
    });

    it("rejects dangerous SQL", async () => {
      await expect(
        engine.query(
          "https://example.com/sample.csv",
          "DROP TABLE datos",
        ),
      ).rejects.toThrow(SqlSanitizationError);
    });

    it("rejects SQL without datos table", async () => {
      await expect(
        engine.query(
          "https://example.com/sample.csv",
          "SELECT 1 + 1",
        ),
      ).rejects.toThrow(SqlSanitizationError);
    });

    it("rejects filesystem functions", async () => {
      await expect(
        engine.query(
          "https://example.com/sample.csv",
          "SELECT * FROM read_csv('/etc/passwd')",
        ),
      ).rejects.toThrow(SqlSanitizationError);
    });
  });

  describe("pagination", () => {
    it("returns totalRows and hasMore", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos",
      );

      expect(result.totalRows).toBe(5);
      expect(result.rowCount).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it("limits rows with limite parameter", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos ORDER BY edad",
        { limite: 2 },
      );

      expect(result.rowCount).toBe(2);
      expect(result.totalRows).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it("skips rows with offset parameter", async () => {
      const all = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos ORDER BY edad",
      );

      const page2 = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos ORDER BY edad",
        { limite: 2, offset: 2 },
      );

      expect(page2.rowCount).toBe(2);
      expect(page2.totalRows).toBe(5);
      expect(page2.hasMore).toBe(true);
      // Page 2 should have different rows than first 2
      expect(page2.rows[0]!["nombre"]).toBe(all.rows[2]!["nombre"]);
    });

    it("last page has hasMore false", async () => {
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos ORDER BY edad",
        { limite: 2, offset: 4 },
      );

      expect(result.rowCount).toBe(1);
      expect(result.totalRows).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it("clamps limite to max 10000", async () => {
      // Should not throw, just clamp
      const result = await engine.query(
        "https://example.com/sample.csv",
        "SELECT * FROM datos",
        { limite: 99999 },
      );

      expect(result.rowCount).toBe(5); // Only 5 rows in fixture
    });
  });

  describe("configurable timeout", () => {
    it("uses custom timeout from options", () => {
      const customEngine = new AnalysisEngine(
        { cacheDir: tmpDir, ttlHours: 24, queryTimeoutMs: 120_000 },
        logger,
      );
      expect(customEngine).toBeInstanceOf(AnalysisEngine);
      customEngine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Session mode
  // -----------------------------------------------------------------------

  describe("sessions", () => {
    it("creates a session and queries a single table", async () => {
      const { sessionId, tablas } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      expect(sessionId).toBeTruthy();
      expect(tablas).toEqual(["personas"]);

      const result = await engine.querySession(
        sessionId,
        "SELECT count(*)::INTEGER AS cnt FROM personas",
      );
      expect(result.totalRows).toBe(1);
      expect(Number(result.rows[0]!["cnt"])).toBe(5);

      engine.closeSession(sessionId);
    });

    it("supports JOINs across tables", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
        { nombre: "ciudades", url: CITIES_URL },
      ]);

      const result = await engine.querySession(
        sessionId,
        `SELECT p.nombre, c.provincia, c.poblacion
         FROM personas p
         JOIN ciudades c ON p.ciudad = c.ciudad
         ORDER BY p.nombre`,
      );

      expect(result.rowCount).toBe(5);
      expect(result.rows[0]).toHaveProperty("provincia");
      // Ana is from Buenos Aires
      expect(result.rows[0]!["nombre"]).toBe("Ana");
      expect(result.rows[0]!["provincia"]).toBe("Buenos Aires");

      engine.closeSession(sessionId);
    });

    it("supports CREATE TEMP TABLE for intermediate results", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
        { nombre: "ciudades", url: CITIES_URL },
      ]);

      // Step 1: create temp table
      const createResult = await engine.querySession(
        sessionId,
        `CREATE TEMP TABLE resumen AS
         SELECT p.ciudad, count(*) AS n, c.poblacion
         FROM personas p
         JOIN ciudades c ON p.ciudad = c.ciudad
         GROUP BY p.ciudad, c.poblacion`,
      );
      expect(createResult.columns).toHaveLength(0);
      expect(createResult.rowCount).toBe(0);

      // Step 2: query the temp table
      const result = await engine.querySession(
        sessionId,
        "SELECT ciudad, n, poblacion FROM resumen ORDER BY n DESC",
      );
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty("ciudad");
      expect(result.rows[0]).toHaveProperty("n");
      expect(result.rows[0]).toHaveProperty("poblacion");

      engine.closeSession(sessionId);
    });

    it("supports pagination in session queries", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      const page1 = await engine.querySession(
        sessionId,
        "SELECT * FROM personas ORDER BY nombre",
        { limite: 2 },
      );
      expect(page1.rowCount).toBe(2);
      expect(page1.totalRows).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await engine.querySession(
        sessionId,
        "SELECT * FROM personas ORDER BY nombre",
        { limite: 2, offset: 2 },
      );
      expect(page2.rowCount).toBe(2);
      expect(page2.hasMore).toBe(true);

      // Different rows
      expect(page1.rows[0]!["nombre"]).not.toBe(page2.rows[0]!["nombre"]);

      engine.closeSession(sessionId);
    });

    it("rejects queries referencing no session tables", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      await expect(
        engine.querySession(sessionId, "SELECT 1 + 1"),
      ).rejects.toThrow(SqlSanitizationError);

      engine.closeSession(sessionId);
    });

    it("rejects dangerous statements in session mode", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      await expect(
        engine.querySession(sessionId, "DROP TABLE personas"),
      ).rejects.toThrow(SqlSanitizationError);

      engine.closeSession(sessionId);
    });

    it("rejects filesystem functions in session mode", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      await expect(
        engine.querySession(
          sessionId,
          "SELECT * FROM read_csv_auto('/etc/passwd')",
        ),
      ).rejects.toThrow(SqlSanitizationError);

      engine.closeSession(sessionId);
    });

    it("rejects CREATE TEMP TABLE with base table name", async () => {
      const { sessionId } = await engine.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      await expect(
        engine.querySession(
          sessionId,
          "CREATE TEMP TABLE personas AS SELECT * FROM personas",
        ),
      ).rejects.toThrow("tabla base");

      engine.closeSession(sessionId);
    });

    it("simple mode (url) still works unchanged", async () => {
      const result = await engine.query(
        SAMPLE_URL,
        "SELECT nombre FROM datos ORDER BY nombre",
        { limite: 2 },
      );
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]!["nombre"]).toBe("Ana");
    });

    it("throws for unknown sessionId", async () => {
      await expect(
        engine.querySession("nonexistent", "SELECT 1"),
      ).rejects.toThrow("no encontrada");
    });

    it("closeSession throws for unknown sessionId", () => {
      expect(() => engine.closeSession("nonexistent")).toThrow(
        "no encontrada",
      );
    });

    it("tracks activeSessionCount", async () => {
      expect(engine.activeSessionCount).toBe(0);

      const s1 = await engine.createSession([
        { nombre: "t1", url: SAMPLE_URL },
      ]);
      expect(engine.activeSessionCount).toBe(1);

      const s2 = await engine.createSession([
        { nombre: "t2", url: SAMPLE_URL },
      ]);
      expect(engine.activeSessionCount).toBe(2);

      engine.closeSession(s1.sessionId);
      expect(engine.activeSessionCount).toBe(1);

      engine.closeSession(s2.sessionId);
      expect(engine.activeSessionCount).toBe(0);
    });
  });
});
