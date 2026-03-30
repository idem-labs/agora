/**
 * SessionManager — persistent SQL sessions with multiple tables.
 *
 * Each session holds a DuckDB in-memory connection with named tables
 * loaded from CSVs. Sessions allow JOINs across datasets and iterative
 * analysis without re-downloading/re-loading data on every query.
 */

import { randomUUID } from "node:crypto";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { Logger } from "../logger.js";
import { FileCache, type FileCacheOptions } from "./file-cache.js";
import { SANDBOX_SETTINGS } from "./sql-sanitizer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceInput {
  /** Table name the user will reference in SQL. */
  nombre: string;
  /** URL to a CSV file. */
  url: string;
}

export interface Session {
  id: string;
  inst: DuckDBInstance;
  conn: DuckDBConnection;
  /** Names of the base tables loaded from CSVs. */
  tables: string[];
  /** Names of temp tables created by the user during the session. */
  tempTables: string[];
  createdAt: Date;
  lastActivity: Date;
}

export interface SessionInfo {
  sessionId: string;
  tablas: string[];
}

export interface SessionManagerOptions extends FileCacheOptions {
  /** Max concurrent sessions (default 3). */
  maxSessions?: number;
  /** Inactivity timeout in ms before auto-close (default 600_000 = 10 min). */
  sessionTimeoutMs?: number;
  /** SQL query timeout in ms (default 60_000). */
  queryTimeoutMs?: number;
  /** Max temp tables per session (default 10). */
  maxTempTables?: number;
  /** Max memory per DuckDB session (default '512MB'). */
  maxMemory?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SESSIONS = 3;
const DEFAULT_SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const DEFAULT_MAX_TEMP_TABLES = 10;
const DEFAULT_MAX_MEMORY = "512MB";
const CLEANUP_INTERVAL_MS = 60_000; // check every minute

/** Valid SQL identifier: letters, digits, underscores. No leading digit. */
const VALID_TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Reserved names that cannot be used as table names. */
const RESERVED_NAMES = new Set([
  "datos",          // used by simple mode
  "__q",            // used internally for count subquery
  "information_schema",
  "pg_catalog",
]);

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly fileCache: FileCache;
  private readonly logger: Logger;
  private readonly maxSessions: number;
  private readonly sessionTimeoutMs: number;
  private readonly maxTempTables: number;
  private readonly maxMemory: string;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: SessionManagerOptions, logger: Logger) {
    this.fileCache = new FileCache(opts, logger);
    this.logger = logger;
    this.maxSessions = opts.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.sessionTimeoutMs = opts.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.maxTempTables = opts.maxTempTables ?? DEFAULT_MAX_TEMP_TABLES;
    this.maxMemory = opts.maxMemory ?? DEFAULT_MAX_MEMORY;

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => this.cleanupInactive(), CLEANUP_INTERVAL_MS);
    // Don't block process exit
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Create a new session with multiple CSVs loaded as named tables.
   *
   * Downloads CSVs in parallel, creates a single DuckDB in-memory connection,
   * loads each CSV into its named table, then applies sandbox settings.
   */
  async createSession(resources: ResourceInput[]): Promise<SessionInfo> {
    // Validate inputs
    if (resources.length === 0) {
      throw new Error("Debe proporcionar al menos un recurso.");
    }

    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Límite de sesiones alcanzado (${this.maxSessions}). ` +
          "Close an existing session with close_session.",
      );
    }

    // Validate table names
    const tableNames = new Set<string>();
    for (const r of resources) {
      const name = r.nombre.toLowerCase();
      if (!VALID_TABLE_NAME_RE.test(name)) {
        throw new Error(
          `Nombre de tabla inválido: '${r.nombre}'. ` +
            "Usá letras, números y guiones bajos (sin empezar con número).",
        );
      }
      if (RESERVED_NAMES.has(name)) {
        throw new Error(`Nombre de tabla reservado: '${r.nombre}'.`);
      }
      if (tableNames.has(name)) {
        throw new Error(`Nombre de tabla duplicado: '${r.nombre}'.`);
      }
      tableNames.add(name);
    }

    // Probe all resources to determine loading strategy
    const probed = await Promise.all(
      resources.map(async (r) => ({
        nombre: r.nombre.toLowerCase(),
        url: r.url,
        probe: await this.fileCache.probe(r.url),
      })),
    );

    // Download only resources within the size limit (in parallel)
    const downloadable = probed.filter((p) => !p.probe.exceedsMaxSize);
    const httpfsResources = probed.filter((p) => p.probe.exceedsMaxSize);

    if (httpfsResources.length > 0) {
      this.logger.info("Session: loading large files via httpfs", {
        tables: httpfsResources.map((r) => r.nombre),
      });
    }

    const downloads = await Promise.all(
      downloadable.map(async (p) => ({
        nombre: p.nombre,
        cached: await this.fileCache.get(p.url),
      })),
    );

    // Create DuckDB connection
    const inst = await DuckDBInstance.create(":memory:");
    const conn = await inst.connect();

    try {
      // Set memory limit
      await conn.run(`SET max_memory = '${this.maxMemory}'`);

      // Load cached CSVs from disk
      for (const { nombre, cached } of downloads) {
        const escaped = cached.path.replace(/\\/g, "/").replace(/'/g, "''");
        await conn.run(
          `CREATE TABLE "${nombre}" AS SELECT * FROM read_csv_auto('${escaped}')`,
        );
      }

      // Load large CSVs via httpfs (external access still enabled at this point)
      for (const { nombre, url } of httpfsResources) {
        const escaped = url.replace(/'/g, "''");
        await conn.run(
          `CREATE TABLE "${nombre}" AS SELECT * FROM read_csv_auto('${escaped}')`,
        );
      }

      // Apply sandbox (Layer 2 — disable filesystem + external access)
      for (const setting of SANDBOX_SETTINGS) {
        try {
          await conn.run(setting);
        } catch {
          this.logger.debug("Sandbox setting skipped (session)", { setting });
        }
      }

      const sessionId = randomUUID();
      const tables = probed.map((p) => p.nombre);
      const session: Session = {
        id: sessionId,
        inst,
        conn,
        tables,
        tempTables: [],
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.sessions.set(sessionId, session);
      this.logger.info("Session created", { sessionId, tables });

      return { sessionId, tablas: tables };
    } catch (err) {
      // Clean up on failure
      conn.closeSync();
      inst.closeSync();
      throw err;
    }
  }

  /**
   * Get an active session by ID. Updates lastActivity.
   * @throws if session not found.
   */
  getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `Sesión no encontrada: ${sessionId}. ` +
          "Puede haber expirado por inactividad.",
      );
    }
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Register a temp table created by the user within a session.
   * Enforces the max temp tables limit.
   */
  registerTempTable(sessionId: string, tableName: string): void {
    const session = this.getSession(sessionId);
    if (session.tempTables.length >= this.maxTempTables) {
      throw new Error(
        `Límite de tablas temporales alcanzado (${this.maxTempTables}) en esta sesión.`,
      );
    }
    session.tempTables.push(tableName.toLowerCase());
  }

  /** Close a session and release its resources. */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sesión no encontrada: ${sessionId}.`);
    }
    session.conn.closeSync();
    session.inst.closeSync();
    this.sessions.delete(sessionId);
    this.logger.info("Session closed", { sessionId });
  }

  /** Close all sessions and stop cleanup timer. */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [id, session] of this.sessions) {
      try {
        session.conn.closeSync();
        session.inst.closeSync();
      } catch {
        // ignore close errors during disposal
      }
      this.sessions.delete(id);
    }
    this.logger.debug("SessionManager disposed");
  }

  /** Number of active sessions. */
  get activeCount(): number {
    return this.sessions.size;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /** Close sessions that have been inactive longer than the timeout. */
  private cleanupInactive(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const idle = now - session.lastActivity.getTime();
      if (idle > this.sessionTimeoutMs) {
        this.logger.info("Auto-closing inactive session", {
          sessionId: id,
          idleMs: idle,
        });
        try {
          session.conn.closeSync();
          // inst.close() is async but we're in a sync cleanup — fire-and-forget
          session.inst.closeSync();
        } catch {
          // ignore
        }
        this.sessions.delete(id);
      }
    }
  }
}
