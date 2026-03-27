import { describe, it, expect } from "vitest";
import {
  sanitizeSql,
  sanitizeSqlForSession,
  SqlSanitizationError,
} from "./sql-sanitizer.js";

describe("sanitizeSql", () => {
  describe("valid queries", () => {
    it("passes simple SELECT from datos", () => {
      const result = sanitizeSql("SELECT * FROM datos LIMIT 10");
      expect(result.sql).toBe("SELECT * FROM datos LIMIT 10");
    });

    it("passes WHERE clause", () => {
      const result = sanitizeSql(
        "SELECT nombre, edad FROM datos WHERE edad > 30",
      );
      expect(result.sql).toContain("WHERE edad > 30");
    });

    it("passes WITH (CTE) queries", () => {
      const result = sanitizeSql(
        "WITH top AS (SELECT * FROM datos LIMIT 5) SELECT * FROM top",
      );
      expect(result.sql).toContain("WITH top");
    });

    it("is case-insensitive for SELECT/WITH", () => {
      const result = sanitizeSql("select * from datos");
      expect(result.sql).toBe("select * from datos");
    });

    it("handles leading whitespace", () => {
      const result = sanitizeSql("  SELECT * FROM datos");
      expect(result.sql).toBe("SELECT * FROM datos");
    });
  });

  describe("blocked statements", () => {
    const blocked = [
      "CREATE TABLE foo (id INT)",
      "DROP TABLE datos",
      "INSERT INTO datos VALUES (1)",
      "DELETE FROM datos",
      "UPDATE datos SET x = 1",
      "ATTACH DATABASE 'evil.db'",
      "INSTALL httpfs",
      "LOAD httpfs",
      "COPY datos TO 'file.csv'",
      "PRAGMA database_list",
      "SET threads = 1",
    ];

    for (const sql of blocked) {
      it(`blocks: ${sql.substring(0, 30)}...`, () => {
        expect(() => sanitizeSql(sql)).toThrow(SqlSanitizationError);
      });
    }
  });

  describe("blocked functions", () => {
    const blocked = [
      "SELECT * FROM read_csv('evil.csv') AS datos",
      "SELECT * FROM read_parquet('evil.parquet') AS datos",
      "SELECT * FROM read_json('evil.json') AS datos",
      "SELECT glob('/etc/*') FROM datos",
    ];

    for (const sql of blocked) {
      it(`blocks: ${sql.substring(0, 40)}...`, () => {
        expect(() => sanitizeSql(sql)).toThrow(SqlSanitizationError);
      });
    }
  });

  describe("multi-statement injection", () => {
    it("blocks semicolon between statements", () => {
      expect(() =>
        sanitizeSql("SELECT * FROM datos; DROP TABLE datos"),
      ).toThrow("';'");
    });

    it("blocks trailing semicolon", () => {
      expect(() => sanitizeSql("SELECT * FROM datos;")).toThrow("';'");
    });

    it("allows semicolons inside string literals", () => {
      const result = sanitizeSql(
        "SELECT * FROM datos WHERE nombre = 'a;b'",
      );
      expect(result.sql).toContain("'a;b'");
    });

    it("handles escaped quotes with semicolons", () => {
      const result = sanitizeSql(
        "SELECT * FROM datos WHERE nombre = 'it''s;ok'",
      );
      expect(result.sql).toContain("it''s;ok");
    });

    it("blocks semicolon after string literal", () => {
      expect(() =>
        sanitizeSql("SELECT * FROM datos WHERE x = 'safe'; DROP TABLE datos"),
      ).toThrow("';'");
    });
  });

  describe("validation errors", () => {
    it("rejects empty SQL", () => {
      expect(() => sanitizeSql("")).toThrow("vacía");
    });

    it("rejects SQL without datos reference", () => {
      expect(() => sanitizeSql("SELECT 1 + 1")).toThrow("datos");
    });

    it("rejects non-SELECT statements", () => {
      expect(() => sanitizeSql("EXPLAIN SELECT * FROM datos")).toThrow(
        "SELECT",
      );
    });
  });
});

// -------------------------------------------------------------------------
// Session mode sanitizer
// -------------------------------------------------------------------------

const defaultSessionOpts = {
  allowedTables: ["personas", "ciudades"],
  tempTables: [] as string[],
  maxTempTables: 10,
};

describe("sanitizeSqlForSession", () => {
  describe("valid SELECT queries", () => {
    it("passes SELECT referencing a session table", () => {
      const result = sanitizeSqlForSession(
        "SELECT * FROM personas",
        defaultSessionOpts,
      );
      expect(result.sql).toContain("personas");
      expect(result.createdTempTable).toBeUndefined();
    });

    it("passes JOIN across session tables", () => {
      const result = sanitizeSqlForSession(
        "SELECT p.nombre, c.provincia FROM personas p JOIN ciudades c ON p.ciudad = c.ciudad",
        defaultSessionOpts,
      );
      expect(result.sql).toContain("JOIN");
    });

    it("passes WITH (CTE) queries", () => {
      const result = sanitizeSqlForSession(
        "WITH top AS (SELECT * FROM personas LIMIT 5) SELECT * FROM top",
        defaultSessionOpts,
      );
      expect(result.sql).toContain("WITH top");
    });

    it("passes query referencing temp tables", () => {
      const result = sanitizeSqlForSession("SELECT * FROM resumen", {
        ...defaultSessionOpts,
        tempTables: ["resumen"],
      });
      expect(result.sql).toContain("resumen");
    });
  });

  describe("CREATE TEMP TABLE", () => {
    it("allows CREATE TEMP TABLE ... AS SELECT", () => {
      const result = sanitizeSqlForSession(
        "CREATE TEMP TABLE resumen AS SELECT ciudad, count(*) AS n FROM personas GROUP BY ciudad",
        defaultSessionOpts,
      );
      expect(result.createdTempTable).toBe("resumen");
      expect(result.sql).toContain("CREATE TEMP TABLE");
    });

    it("allows CREATE TEMPORARY TABLE (full keyword)", () => {
      const result = sanitizeSqlForSession(
        "CREATE TEMPORARY TABLE resumen AS SELECT * FROM personas",
        defaultSessionOpts,
      );
      expect(result.createdTempTable).toBe("resumen");
    });

    it("allows CREATE TEMP TABLE IF NOT EXISTS", () => {
      const result = sanitizeSqlForSession(
        "CREATE TEMP TABLE IF NOT EXISTS resumen AS SELECT * FROM personas",
        defaultSessionOpts,
      );
      expect(result.createdTempTable).toBe("resumen");
    });

    it("rejects CREATE TEMP TABLE with base table name", () => {
      expect(() =>
        sanitizeSqlForSession(
          "CREATE TEMP TABLE personas AS SELECT * FROM personas",
          defaultSessionOpts,
        ),
      ).toThrow("tabla base");
    });

    it("enforces max temp tables limit", () => {
      expect(() =>
        sanitizeSqlForSession(
          "CREATE TEMP TABLE nueva AS SELECT * FROM personas",
          { ...defaultSessionOpts, tempTables: ["t1", "t2"], maxTempTables: 2 },
        ),
      ).toThrow("Límite de tablas temporales");
    });

    it("rejects CREATE TABLE (without TEMP)", () => {
      expect(() =>
        sanitizeSqlForSession(
          "CREATE TABLE evil AS SELECT * FROM personas",
          defaultSessionOpts,
        ),
      ).toThrow(SqlSanitizationError);
    });
  });

  describe("blocked statements in session mode", () => {
    const blocked = [
      "DROP TABLE personas",
      "INSERT INTO personas VALUES (1)",
      "DELETE FROM personas",
      "UPDATE personas SET x = 1",
      "ATTACH DATABASE 'evil.db'",
      "INSTALL httpfs",
      "COPY personas TO 'file.csv'",
      "SET threads = 1",
    ];

    for (const sql of blocked) {
      it(`blocks: ${sql.substring(0, 30)}...`, () => {
        expect(() =>
          sanitizeSqlForSession(sql, defaultSessionOpts),
        ).toThrow(SqlSanitizationError);
      });
    }
  });

  describe("blocked functions in session mode", () => {
    it("blocks read_csv in SELECT", () => {
      expect(() =>
        sanitizeSqlForSession(
          "SELECT * FROM read_csv('/etc/passwd') AS personas",
          defaultSessionOpts,
        ),
      ).toThrow("read_csv");
    });

    it("blocks read_csv in CREATE TEMP TABLE", () => {
      expect(() =>
        sanitizeSqlForSession(
          "CREATE TEMP TABLE evil AS SELECT * FROM read_csv_auto('/etc/passwd')",
          defaultSessionOpts,
        ),
      ).toThrow("read_csv_auto");
    });
  });

  describe("multi-statement injection (session)", () => {
    it("blocks semicolon in session mode", () => {
      expect(() =>
        sanitizeSqlForSession(
          "SELECT * FROM personas; DROP TABLE personas",
          defaultSessionOpts,
        ),
      ).toThrow("';'");
    });

    it("allows semicolons inside string literals in session mode", () => {
      const result = sanitizeSqlForSession(
        "SELECT * FROM personas WHERE nombre = 'a;b'",
        defaultSessionOpts,
      );
      expect(result.sql).toContain("'a;b'");
    });
  });

  describe("validation errors", () => {
    it("rejects empty SQL", () => {
      expect(() =>
        sanitizeSqlForSession("", defaultSessionOpts),
      ).toThrow("vacía");
    });

    it("rejects SQL without any session table reference", () => {
      expect(() =>
        sanitizeSqlForSession("SELECT 1 + 1", defaultSessionOpts),
      ).toThrow("tabla de la sesión");
    });

    it("rejects non-SELECT/CREATE TEMP statements", () => {
      expect(() =>
        sanitizeSqlForSession(
          "EXPLAIN SELECT * FROM personas",
          defaultSessionOpts,
        ),
      ).toThrow(SqlSanitizationError);
    });
  });
});
