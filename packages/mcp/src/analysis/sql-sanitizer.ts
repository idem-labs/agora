/**
 * SQL Sanitizer — dual-layer validation for user-provided SQL.
 *
 * Layer 1 (regex):  Block dangerous statements and filesystem functions.
 * Layer 2 (DuckDB): SET disabled_filesystems at connection level (applied by AnalysisEngine).
 *
 * Two modes:
 * - Simple mode: user writes SQL using `datos` as the table name (single CSV).
 * - Session mode: user writes SQL using named tables loaded via crear_sesion_sql.
 *   Allows CREATE TEMP TABLE ... AS SELECT within sessions.
 */

/** Statements that are never allowed in simple mode. */
const BLOCKED_STATEMENTS = [
  "CREATE",
  "DROP",
  "ALTER",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "INSTALL",
  "LOAD",
  "COPY",
  "EXPORT",
  "IMPORT",
  "PRAGMA",
  "SET",
  "CALL",
  "EXECUTE",
  "PREPARE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "GRANT",
  "REVOKE",
  "VACUUM",
  "CHECKPOINT",
];

/**
 * Statements blocked in session mode.
 * CREATE is NOT here — it's handled specially (only CREATE TEMP TABLE ... AS SELECT allowed).
 */
const BLOCKED_STATEMENTS_SESSION = BLOCKED_STATEMENTS.filter((s) => s !== "CREATE");

/** Functions that access the filesystem or network (defense-in-depth). */
const BLOCKED_FUNCTIONS = [
  "read_csv",
  "read_csv_auto",
  "read_parquet",
  "read_json",
  "read_json_auto",
  "write_csv",
  "write_parquet",
  "read_blob",
  "read_text",
  "glob",
  "httpfs",
  "s3",
];

const BLOCKED_STMT_RE = new RegExp(
  `^\\s*(${BLOCKED_STATEMENTS.join("|")})\\b`,
  "i",
);

const BLOCKED_STMT_SESSION_RE = new RegExp(
  `^\\s*(${BLOCKED_STATEMENTS_SESSION.join("|")})\\b`,
  "i",
);

const BLOCKED_FN_RE = new RegExp(
  `\\b(${BLOCKED_FUNCTIONS.join("|")})\\s*\\(`,
  "i",
);

/** Result of sanitization. */
export interface SanitizedQuery {
  /** The validated SQL ready to execute */
  sql: string;
}

export class SqlSanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlSanitizationError";
  }
}

/**
 * Detect semicolons outside of string literals (single-quoted in SQL).
 * Prevents multi-statement injection like `SELECT ...; DROP TABLE datos`.
 */
function containsSemicolonOutsideStrings(sql: string): boolean {
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inString) {
      inString = true;
    } else if (ch === "'" && inString) {
      // Handle escaped quotes ('')
      if (i + 1 < sql.length && sql[i + 1] === "'") {
        i++; // skip escaped quote
      } else {
        inString = false;
      }
    } else if (ch === ";" && !inString) {
      return true;
    }
  }
  return false;
}

/**
 * Validate user SQL. The `datos` table is pre-loaded by the engine.
 *
 * - Blocks dangerous statements and filesystem functions (Layer 1).
 * - Ensures the query references the `datos` table.
 *
 * @throws SqlSanitizationError if the query is not allowed.
 */
export function sanitizeSql(userSql: string): SanitizedQuery {
  const trimmed = userSql.trim();

  if (!trimmed) {
    throw new SqlSanitizationError("La consulta SQL está vacía.");
  }

  // Layer 1a: block multi-statement SQL (semicolons outside string literals)
  if (containsSemicolonOutsideStrings(trimmed)) {
    throw new SqlSanitizationError(
      "No se permiten múltiples sentencias SQL (';' detectado).",
    );
  }

  // Layer 1b: block dangerous statements
  const stmtMatch = BLOCKED_STMT_RE.exec(trimmed);
  if (stmtMatch) {
    throw new SqlSanitizationError(
      `Sentencia no permitida: ${stmtMatch[1].toUpperCase()}`,
    );
  }

  // Layer 1b: block filesystem/network functions
  const fnMatch = BLOCKED_FN_RE.exec(trimmed);
  if (fnMatch) {
    throw new SqlSanitizationError(
      `Función no permitida: ${fnMatch[1]}`,
    );
  }

  // Must start with SELECT or WITH
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    throw new SqlSanitizationError(
      "Solo se permiten consultas SELECT (o WITH ... SELECT).",
    );
  }

  // Verify that the user references the `datos` table
  if (!/\bdatos\b/i.test(trimmed)) {
    throw new SqlSanitizationError(
      "La consulta debe referenciar la tabla 'datos'. " +
        "Ejemplo: SELECT * FROM datos LIMIT 10",
    );
  }

  return { sql: trimmed };
}

// ---------------------------------------------------------------------------
// Session mode sanitizer
// ---------------------------------------------------------------------------

/** Regex to match CREATE TEMP TABLE <name> AS ... */
const CREATE_TEMP_RE =
  /^\s*CREATE\s+TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+AS\s+/i;

export interface SessionSanitizeOptions {
  /** Table names loaded in the session (base tables). */
  allowedTables: string[];
  /** Temp tables already created in this session. */
  tempTables: string[];
  /** Max temp tables allowed (for validation). */
  maxTempTables: number;
}

export interface SessionSanitizedQuery extends SanitizedQuery {
  /** If the query creates a temp table, this is its name. */
  createdTempTable?: string;
}

/**
 * Validate user SQL for session mode.
 *
 * - Allows SELECT/WITH queries referencing any of the session's tables.
 * - Allows CREATE TEMP TABLE <name> AS SELECT ... (with limits).
 * - Blocks all other dangerous statements and filesystem functions.
 *
 * @throws SqlSanitizationError if the query is not allowed.
 */
export function sanitizeSqlForSession(
  userSql: string,
  opts: SessionSanitizeOptions,
): SessionSanitizedQuery {
  const trimmed = userSql.trim();

  if (!trimmed) {
    throw new SqlSanitizationError("La consulta SQL está vacía.");
  }

  // Block multi-statement SQL (semicolons outside string literals)
  if (containsSemicolonOutsideStrings(trimmed)) {
    throw new SqlSanitizationError(
      "No se permiten múltiples sentencias SQL (';' detectado).",
    );
  }

  // Block filesystem/network functions (same as simple mode)
  const fnMatch = BLOCKED_FN_RE.exec(trimmed);
  if (fnMatch) {
    throw new SqlSanitizationError(
      `Función no permitida: ${fnMatch[1]}`,
    );
  }

  // Check if it's a CREATE TEMP TABLE statement
  const createMatch = CREATE_TEMP_RE.exec(trimmed);
  if (createMatch) {
    return validateCreateTemp(trimmed, createMatch, opts);
  }

  // For non-CREATE statements, block dangerous statements (session list)
  const stmtMatch = BLOCKED_STMT_SESSION_RE.exec(trimmed);
  if (stmtMatch) {
    throw new SqlSanitizationError(
      `Sentencia no permitida: ${stmtMatch[1].toUpperCase()}`,
    );
  }

  // Must start with SELECT or WITH
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    throw new SqlSanitizationError(
      "Solo se permiten consultas SELECT, WITH ... SELECT, o CREATE TEMP TABLE ... AS SELECT.",
    );
  }

  // Must reference at least one session table
  const allTables = [...opts.allowedTables, ...opts.tempTables];
  const referencesTable = allTables.some(
    (t) => new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(trimmed),
  );
  if (!referencesTable) {
    throw new SqlSanitizationError(
      `La consulta debe referenciar alguna tabla de la sesión: ${allTables.join(", ")}.`,
    );
  }

  return { sql: trimmed };
}

function validateCreateTemp(
  trimmed: string,
  match: RegExpExecArray,
  opts: SessionSanitizeOptions,
): SessionSanitizedQuery {
  // Extract table name (strip quotes if present)
  const rawName = match[1].replace(/"/g, "");
  const name = rawName.toLowerCase();

  // Check temp table limit
  if (opts.tempTables.length >= opts.maxTempTables) {
    throw new SqlSanitizationError(
      `Límite de tablas temporales alcanzado (${opts.maxTempTables}).`,
    );
  }

  // Block reserved/existing table names
  if (opts.allowedTables.includes(name)) {
    throw new SqlSanitizationError(
      `No se puede crear una tabla temporal con el nombre de una tabla base: '${rawName}'.`,
    );
  }

  // Block filesystem functions in the AS SELECT part
  // (already checked above, but double-check the SELECT portion)
  const selectPart = trimmed.slice(match[0].length);
  const fnMatch2 = BLOCKED_FN_RE.exec(selectPart);
  if (fnMatch2) {
    throw new SqlSanitizationError(
      `Función no permitida: ${fnMatch2[1]}`,
    );
  }

  return { sql: trimmed, createdTempTable: name };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * DuckDB connection-level sandbox settings (Layer 2).
 * Applied AFTER loading data into tables.
 */
export const SANDBOX_SETTINGS = [
  "SET disabled_filesystems = 'LocalFileSystem'",
  "SET enable_external_access = false",
] as const;
