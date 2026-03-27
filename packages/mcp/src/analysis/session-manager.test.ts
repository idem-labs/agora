import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "./session-manager.js";
import { cacheKey } from "./file-cache.js";
import { closeAllDatabases } from "../duckdb.js";

const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

const FIXTURE_SAMPLE = resolve(
  import.meta.dirname,
  "../__fixtures__/sample.csv",
);
const FIXTURE_CITIES = resolve(
  import.meta.dirname,
  "../__fixtures__/cities.csv",
);

const SAMPLE_URL = "https://example.com/sample.csv";
const CITIES_URL = "https://example.com/cities.csv";

describe("SessionManager", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agora-session-"));

    // Pre-populate cache with fixtures
    await copyFile(FIXTURE_SAMPLE, join(tmpDir, cacheKey(SAMPLE_URL)));
    await copyFile(FIXTURE_CITIES, join(tmpDir, cacheKey(CITIES_URL)));

    manager = new SessionManager(
      { cacheDir: tmpDir, ttlHours: 24, maxSessions: 3, sessionTimeoutMs: 5000 },
      logger,
    );
  });

  afterEach(async () => {
    manager.dispose();
    closeAllDatabases();
    await new Promise((r) => setTimeout(r, 100));
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("createSession", () => {
    it("creates a session with multiple tables", async () => {
      const result = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
        { nombre: "ciudades", url: CITIES_URL },
      ]);

      expect(result.sessionId).toBeTruthy();
      expect(result.tablas).toEqual(["personas", "ciudades"]);
      expect(manager.activeCount).toBe(1);
    });

    it("rejects empty resources", async () => {
      await expect(manager.createSession([])).rejects.toThrow(
        "al menos un recurso",
      );
    });

    it("rejects invalid table names", async () => {
      await expect(
        manager.createSession([{ nombre: "123bad", url: SAMPLE_URL }]),
      ).rejects.toThrow("inválido");
    });

    it("rejects reserved table names", async () => {
      await expect(
        manager.createSession([{ nombre: "datos", url: SAMPLE_URL }]),
      ).rejects.toThrow("reservado");
    });

    it("rejects duplicate table names", async () => {
      await expect(
        manager.createSession([
          { nombre: "tabla", url: SAMPLE_URL },
          { nombre: "tabla", url: CITIES_URL },
        ]),
      ).rejects.toThrow("duplicado");
    });

    it("enforces max sessions limit", async () => {
      await manager.createSession([{ nombre: "t1", url: SAMPLE_URL }]);
      await manager.createSession([{ nombre: "t2", url: SAMPLE_URL }]);
      await manager.createSession([{ nombre: "t3", url: SAMPLE_URL }]);

      await expect(
        manager.createSession([{ nombre: "t4", url: SAMPLE_URL }]),
      ).rejects.toThrow("Límite de sesiones");
    });
  });

  describe("getSession", () => {
    it("returns active session", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      const session = manager.getSession(sessionId);
      expect(session.tables).toEqual(["personas"]);
    });

    it("throws for unknown session", () => {
      expect(() => manager.getSession("nonexistent")).toThrow(
        "no encontrada",
      );
    });

    it("updates lastActivity on access", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      const before = manager.getSession(sessionId).lastActivity;
      await new Promise((r) => setTimeout(r, 50));
      const after = manager.getSession(sessionId).lastActivity;

      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("closeSession", () => {
    it("removes session from active sessions", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      expect(manager.activeCount).toBe(1);
      manager.closeSession(sessionId);
      expect(manager.activeCount).toBe(0);
    });

    it("throws for unknown session", () => {
      expect(() => manager.closeSession("nonexistent")).toThrow(
        "no encontrada",
      );
    });
  });

  describe("registerTempTable", () => {
    it("registers temp table in session", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      manager.registerTempTable(sessionId, "resumen");
      const session = manager.getSession(sessionId);
      expect(session.tempTables).toContain("resumen");
    });

    it("enforces max temp tables limit", async () => {
      const mgr = new SessionManager(
        { cacheDir: tmpDir, ttlHours: 24, maxTempTables: 2 },
        logger,
      );
      try {
        const { sessionId } = await mgr.createSession([
          { nombre: "personas", url: SAMPLE_URL },
        ]);

        mgr.registerTempTable(sessionId, "temp1");
        mgr.registerTempTable(sessionId, "temp2");

        expect(() => mgr.registerTempTable(sessionId, "temp3")).toThrow(
          "Límite de tablas temporales",
        );
      } finally {
        mgr.dispose();
      }
    });
  });

  describe("SQL execution via session connection", () => {
    it("can query a single table", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      const session = manager.getSession(sessionId);
      const reader = await session.conn.runAndReadAll(
        "SELECT count(*)::INTEGER AS cnt FROM personas",
      );
      const rows = reader.getRowObjectsJson();
      expect((rows[0] as Record<string, number>)?.["cnt"]).toBe(5);
    });

    it("can JOIN two tables", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
        { nombre: "ciudades", url: CITIES_URL },
      ]);

      const session = manager.getSession(sessionId);
      const reader = await session.conn.runAndReadAll(
        `SELECT p.nombre, p.ciudad, c.provincia, c.poblacion
         FROM personas p
         JOIN ciudades c ON p.ciudad = c.ciudad
         ORDER BY p.nombre`,
      );
      const rows = reader.getRowObjectsJson() as Record<string, unknown>[];

      expect(rows).toHaveLength(5);
      expect(rows[0]).toHaveProperty("provincia");
      expect(rows[0]).toHaveProperty("poblacion");
    });

    it("sandbox blocks filesystem access", async () => {
      const { sessionId } = await manager.createSession([
        { nombre: "personas", url: SAMPLE_URL },
      ]);

      const session = manager.getSession(sessionId);
      await expect(
        session.conn.runAndReadAll(
          "SELECT * FROM read_csv_auto('/etc/passwd')",
        ),
      ).rejects.toThrow();
    });
  });

  describe("dispose", () => {
    it("closes all sessions", async () => {
      await manager.createSession([{ nombre: "t1", url: SAMPLE_URL }]);
      await manager.createSession([{ nombre: "t2", url: SAMPLE_URL }]);

      expect(manager.activeCount).toBe(2);
      manager.dispose();
      expect(manager.activeCount).toBe(0);
    });
  });
});
