import { join } from "node:path";
import { homedir } from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  /** Base directory for persistent data (metadata cache, indexes) */
  dataDir: string;
  /** Base directory for downloaded file cache */
  cacheDir: string;
  /** Log level */
  logLevel: LogLevel;
  /** Metadata cache TTL in hours */
  metadataTtlHours: number;
  /** Preset names to activate (comma-separated via AGORA_PRESETS) */
  presets: string[];
  /** Explicit catalog IDs to activate (comma-separated via AGORA_CATALOGS) */
  catalogIds: string[];
  /** Batch size for embedding generation */
  embeddingBatchSize: number;
  /** SQL query timeout in ms (default: 60_000, max: 300_000) */
  queryTimeoutMs: number;
  /** Max file size for download in bytes (default: 200MB). Larger files use DuckDB httpfs. */
  maxFileSizeBytes: number;
}

const LOG_LEVELS: ReadonlySet<string> = new Set([
  "debug",
  "info",
  "warn",
  "error",
]);

function env(key: string): string | undefined {
  return process.env[`AGORA_${key}`];
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && LOG_LEVELS.has(value.toLowerCase())) {
    return value.toLowerCase() as LogLevel;
  }
  return "info";
}

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse a comma-separated list, trimming whitespace and filtering empties. */
function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const AGORA_HOME = join(homedir(), ".agora");

const DEFAULT_QUERY_TIMEOUT_MS = 60_000;
const MAX_QUERY_TIMEOUT_MS = 300_000;

function parseQueryTimeout(value: string | undefined): number {
  const ms = parsePositiveNumber(value, DEFAULT_QUERY_TIMEOUT_MS);
  return Math.min(ms, MAX_QUERY_TIMEOUT_MS);
}

const DEFAULT_MAX_FILE_SIZE_MB = 200;

export function loadConfig(): Config {
  return {
    dataDir: env("DATA_DIR") || join(AGORA_HOME, "data"),
    cacheDir: env("CACHE_DIR") || join(AGORA_HOME, "cache"),
    logLevel: parseLogLevel(env("LOG_LEVEL")),
    metadataTtlHours: parsePositiveNumber(env("METADATA_TTL_HOURS"), 24),
    presets: parseCommaSeparated(env("PRESETS")),
    catalogIds: parseCommaSeparated(env("CATALOGS")),
    embeddingBatchSize: parsePositiveNumber(env("EMBEDDING_BATCH_SIZE"), 64),
    queryTimeoutMs: parseQueryTimeout(env("QUERY_TIMEOUT_MS")),
    maxFileSizeBytes:
      parsePositiveNumber(env("MAX_FILE_SIZE_MB"), DEFAULT_MAX_FILE_SIZE_MB) *
      1024 *
      1024,
  };
}
