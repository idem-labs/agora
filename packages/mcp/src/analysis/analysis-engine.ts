import { DuckDBInstance, type DuckDBConnection, type DuckDBResultReader } from "@duckdb/node-api";
import type { Logger } from "../logger.js";
import { FileCache, type FileCacheOptions } from "./file-cache.js";
import { decodeBuffer } from "./encoding.js";
import {
  sanitizeSql,
  sanitizeSqlForSession,
  SqlSanitizationError,
  SANDBOX_SETTINGS,
} from "./sql-sanitizer.js";
import {
  SessionManager,
  type ResourceInput,
  type SessionInfo,
} from "./session-manager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface InspectResult {
  columns: ColumnInfo[];
  rowCount: number;
  preview: Record<string, unknown>[];
  encoding: string;
  fromCache: boolean;
}

export interface QueryOptions {
  /** Max rows to return (default 1000, max 10000). */
  limite?: number;
  /** Rows to skip before returning results (default 0). */
  offset?: number;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  /** Number of rows returned in this page. */
  rowCount: number;
  /** Total rows matching the query (before LIMIT/OFFSET). */
  totalRows: number;
  /** Whether there are more rows beyond this page. */
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEW_ROWS = 5;
const DEFAULT_QUERY_LIMIT = 1000;
const MAX_QUERY_LIMIT = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// AnalysisEngine
// ---------------------------------------------------------------------------

export interface AnalysisEngineOptions extends FileCacheOptions {
  /** SQL query timeout in ms (default: 60_000). */
  queryTimeoutMs?: number;
  /** Max concurrent sessions (default 3). */
  maxSessions?: number;
  /** Session inactivity timeout in ms (default 600_000 = 10 min). */
  sessionTimeoutMs?: number;
  /** Max temp tables per session (default 10). */
  maxTempTables?: number;
  /** Max memory per session (default '512MB'). */
  maxMemory?: string;
}

export class AnalysisEngine {
  private readonly fileCache: FileCache;
  private readonly logger: Logger;
  private readonly queryTimeoutMs: number;
  private readonly sessionManager: SessionManager;
  private readonly maxTempTables: number;

  constructor(opts: AnalysisEngineOptions, logger: Logger) {
    this.fileCache = new FileCache(opts, logger);
    this.logger = logger;
    this.queryTimeoutMs = opts.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    this.maxTempTables = opts.maxTempTables ?? 10;
    this.sessionManager = new SessionManager(
      {
        cacheDir: opts.cacheDir,
        downloadTimeoutMs: opts.downloadTimeoutMs,
        maxFileSizeBytes: opts.maxFileSizeBytes,
        ttlHours: opts.ttlHours,
        queryTimeoutMs: opts.queryTimeoutMs,
        maxSessions: opts.maxSessions,
        sessionTimeoutMs: opts.sessionTimeoutMs,
        maxTempTables: opts.maxTempTables,
        maxMemory: opts.maxMemory,
      },
      logger,
    );
  }

  /**
   * Download (or fetch from cache) a CSV file and inspect its structure.
   * Returns column names/types, row count, encoding, and a preview.
   * Falls back to DuckDB httpfs for files exceeding the download limit.
   */
  async inspect(url: string): Promise<InspectResult> {
    const probe = await this.fileCache.probe(url);

    let csvExpr: string;
    let encoding = "auto";
    let fromCache = false;

    if (probe.exceedsMaxSize) {
      this.logger.info("Using httpfs for large file inspect", {
        url,
        contentLength: probe.contentLength,
      });
      csvExpr = csvAutoExpr(url);
    } else {
      const cached = await this.fileCache.get(url);
      const detected = await this.detectEncoding(cached.path);
      encoding = detected.encoding;
      fromCache = cached.fromCache;
      csvExpr = csvAutoExpr(cached.path);
    }

    const { conn, inst } = await this.createConnection();
    try {
      // Column info
      const descReader = await conn.runAndReadAll(
        `DESCRIBE SELECT * FROM ${csvExpr}`,
      );
      const descRows = descReader.getRowObjectsJson() as Record<string, string>[];
      const columns: ColumnInfo[] = descRows.map((r) => ({
        name: r["column_name"],
        type: r["column_type"],
      }));

      // Row count
      const countReader = await conn.runAndReadAll(
        `SELECT count(*)::INTEGER AS cnt FROM ${csvExpr}`,
      );
      const countRows = countReader.getRowObjectsJson();
      const rowCount = (countRows[0]?.["cnt"] as number) ?? 0;

      // Preview (first N rows)
      const previewReader = await conn.runAndReadAll(
        `SELECT * FROM ${csvExpr} LIMIT ${PREVIEW_ROWS}`,
      );
      const preview = previewReader.getRowObjectsJson() as Record<
        string,
        unknown
      >[];

      return { columns, rowCount, preview, encoding, fromCache };
    } finally {
      conn.closeSync();
      inst.closeSync();
    }
  }

  /**
   * Execute a sanitized SQL query against a CSV file.
   * The user writes SQL referencing the `datos` table.
   *
   * Strategy:
   * 1. Probe URL — if too large for download, use DuckDB httpfs.
   * 2. Load CSV into an in-memory `datos` table (before sandbox).
   * 3. Apply sandbox settings (disable filesystem + external access).
   * 4. Execute user SQL against the `datos` table with pagination.
   */
  async query(
    url: string,
    userSql: string,
    opts?: QueryOptions,
  ): Promise<QueryResult> {
    // 1. Sanitize SQL (Layer 1 — regex)
    let sanitized;
    try {
      sanitized = sanitizeSql(userSql);
    } catch (err) {
      if (err instanceof SqlSanitizationError) throw err;
      throw new SqlSanitizationError(`Error al validar SQL: ${String(err)}`);
    }

    // 2. Resolve pagination params
    const limite = clampLimit(opts?.limite);
    const offset = Math.max(0, opts?.offset ?? 0);

    // 3. Determine loading strategy
    const probe = await this.fileCache.probe(url);

    // 4. Set up sandboxed connection with data pre-loaded
    const { conn, inst } = await this.createConnection();
    try {
      if (probe.exceedsMaxSize) {
        // httpfs path: load directly from URL (external access enabled by default)
        this.logger.info("Using httpfs for large file query", {
          url,
          contentLength: probe.contentLength,
        });
        await conn.run(
          `CREATE TABLE datos AS SELECT * FROM ${csvAutoExpr(url)}`,
        );
      } else {
        // Standard path: download to cache, load from disk
        const cached = await this.fileCache.get(url);
        await conn.run(
          `CREATE TABLE datos AS SELECT * FROM ${csvAutoExpr(cached.path)}`,
        );
      }

      // Apply sandbox (Layer 2 — disables filesystem + external access)
      for (const setting of SANDBOX_SETTINGS) {
        try {
          await conn.run(setting);
        } catch {
          this.logger.debug("Sandbox setting skipped", { setting });
        }
      }

      // 5. Count total rows for the user's query (wrap in subquery)
      const countSql = `SELECT count(*)::INTEGER AS cnt FROM (${sanitized.sql}) AS __q`;
      const countReader = await this.runWithTimeout(conn, countSql);
      const totalRows = ((countReader.getRowObjectsJson()[0] as Record<string, number>)?.["cnt"]) ?? 0;

      // 6. Execute user SQL with LIMIT/OFFSET
      const paginatedSql = `${sanitized.sql} LIMIT ${limite} OFFSET ${offset}`;
      const reader = await this.runWithTimeout(conn, paginatedSql);
      const allRows = reader.getRowObjectsJson() as Record<string, unknown>[];

      const colNames = reader.columnNames();
      const colTypes = reader.columnTypesJson() as unknown as string[];
      const columns: ColumnInfo[] = colNames.map((name, i) => ({
        name,
        type: String(colTypes[i] ?? "UNKNOWN"),
      }));

      const hasMore = offset + allRows.length < totalRows;
      return { columns, rows: allRows, rowCount: allRows.length, totalRows, hasMore };
    } finally {
      conn.closeSync();
      inst.closeSync();
    }
  }

  // -------------------------------------------------------------------------
  // Session methods
  // -------------------------------------------------------------------------

  /** Create a SQL session with multiple CSVs as named tables. */
  async createSession(resources: ResourceInput[]): Promise<SessionInfo> {
    return this.sessionManager.createSession(resources);
  }

  /**
   * Execute SQL within an existing session. Supports JOINs across tables
   * and CREATE TEMP TABLE ... AS SELECT for intermediate results.
   */
  async querySession(
    sessionId: string,
    userSql: string,
    opts?: QueryOptions,
  ): Promise<QueryResult> {
    const session = this.sessionManager.getSession(sessionId);

    // Sanitize for session mode
    let sanitized;
    try {
      sanitized = sanitizeSqlForSession(userSql, {
        allowedTables: session.tables,
        tempTables: session.tempTables,
        maxTempTables: this.maxTempTables,
      });
    } catch (err) {
      if (err instanceof SqlSanitizationError) throw err;
      throw new SqlSanitizationError(`Error al validar SQL: ${String(err)}`);
    }

    // Handle CREATE TEMP TABLE — execute and return empty result
    if (sanitized.createdTempTable) {
      await this.runWithTimeout(session.conn, sanitized.sql);
      this.sessionManager.registerTempTable(sessionId, sanitized.createdTempTable);
      this.logger.debug("Temp table created in session", {
        sessionId,
        table: sanitized.createdTempTable,
      });
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        totalRows: 0,
        hasMore: false,
      };
    }

    // Regular SELECT — with pagination
    const limite = clampLimit(opts?.limite);
    const offset = Math.max(0, opts?.offset ?? 0);

    const countSql = `SELECT count(*)::INTEGER AS cnt FROM (${sanitized.sql}) AS __q`;
    const countReader = await this.runWithTimeout(session.conn, countSql);
    const totalRows =
      ((countReader.getRowObjectsJson()[0] as Record<string, number>)?.["cnt"]) ?? 0;

    const paginatedSql = `${sanitized.sql} LIMIT ${limite} OFFSET ${offset}`;
    const reader = await this.runWithTimeout(session.conn, paginatedSql);
    const allRows = reader.getRowObjectsJson() as Record<string, unknown>[];

    const colNames = reader.columnNames();
    const colTypes = reader.columnTypesJson() as unknown as string[];
    const columns: ColumnInfo[] = colNames.map((name, i) => ({
      name,
      type: String(colTypes[i] ?? "UNKNOWN"),
    }));

    const hasMore = offset + allRows.length < totalRows;
    return { columns, rows: allRows, rowCount: allRows.length, totalRows, hasMore };
  }

  /** Close a session and release its resources. */
  closeSession(sessionId: string): void {
    this.sessionManager.closeSession(sessionId);
  }

  /** Number of active sessions. */
  get activeSessionCount(): number {
    return this.sessionManager.activeCount;
  }

  /** Dispose all sessions and stop cleanup timers. */
  dispose(): void {
    this.sessionManager.dispose();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Detect encoding of a cached file. */
  private async detectEncoding(
    filePath: string,
  ): Promise<{ encoding: string }> {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(filePath);
    const { encoding } = decodeBuffer(buffer);
    return { encoding };
  }

  /** Create a fresh in-memory DuckDB instance + connection (not shared). */
  private async createConnection(): Promise<{ conn: DuckDBConnection; inst: DuckDBInstance }> {
    const inst = await DuckDBInstance.create(":memory:");
    const conn = await inst.connect();
    return { conn, inst };
  }

  /**
   * Run SQL with a timeout. Throws on timeout.
   *
   * LIMITATION: This uses Promise.race — when the timeout fires, the JS
   * promise resolves with an error, but the underlying DuckDB native query
   * continues running until it completes or the connection is closed.
   * DuckDB's Node API does not expose query cancellation.
   */
  private async runWithTimeout(
    conn: DuckDBConnection,
    sql: string,
  ): Promise<DuckDBResultReader> {
    const result = await Promise.race([
      conn.runAndReadAll(sql),
      timeout(this.queryTimeoutMs),
    ]);

    if (!result) {
      throw new Error(
        `Query timed out after ${this.queryTimeoutMs / 1000}s`,
      );
    }
    return result as DuckDBResultReader;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Build a read_csv_auto expression for a local file path or remote URL. */
function csvAutoExpr(pathOrUrl: string): string {
  const escaped = pathOrUrl.replace(/\\/g, "/").replace(/'/g, "''");
  return `read_csv_auto('${escaped}')`;
}

/** Clamp the user-provided limit to the allowed range. */
function clampLimit(value: number | undefined): number {
  if (value == null) return DEFAULT_QUERY_LIMIT;
  return Math.max(1, Math.min(value, MAX_QUERY_LIMIT));
}

/** Returns a promise that resolves to null after ms milliseconds. */
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
