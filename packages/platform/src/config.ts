import type { LogLevel } from "agora-mcp/lib";

export interface PipelineConfig {
  /** Output directory for JSON score files */
  outputDir: string;
  /** Max concurrent HEAD requests for accessibility scoring */
  concurrency: number;
  /** HEAD request timeout in ms */
  headTimeoutMs: number;
  /** Log level */
  logLevel: LogLevel;
  /** Preset IDs to activate (from catalog directory) */
  presets: string[];
  /** Explicit catalog IDs to activate */
  catalogIds: string[];
  /** Freshness half-life in days (score = 0.5 at this age) */
  freshnessHalfLifeDays: number;
  /** Max datasets per catalog for accessibility HEAD checks (0 = all) */
  accessibilitySampleSize: number;
  /** Max datasets to ingest per catalog (0 = unlimited) */
  maxDatasetsPerCatalog: number;
  /** CKAN page size for bulk listing (default: 1000) */
  ckanPageSize: number;
}

export function loadPipelineConfig(): PipelineConfig {
  const env = process.env;

  return {
    outputDir: env.AGORA_PIPELINE_OUTPUT_DIR ?? "./data",
    concurrency: parseIntEnv(env.AGORA_PIPELINE_CONCURRENCY, 20),
    headTimeoutMs: parseIntEnv(env.AGORA_PIPELINE_HEAD_TIMEOUT_MS, 5_000),
    logLevel: (env.AGORA_LOG_LEVEL as LogLevel) ?? "info",
    presets: env.AGORA_PRESETS ? env.AGORA_PRESETS.split(",").map((s) => s.trim()) : ["all"],
    catalogIds: env.AGORA_CATALOGS ? env.AGORA_CATALOGS.split(",").map((s) => s.trim()) : [],
    freshnessHalfLifeDays: parseIntEnv(env.AGORA_PIPELINE_FRESHNESS_HALF_LIFE_DAYS, 180),
    accessibilitySampleSize: parseIntEnv(env.AGORA_PIPELINE_ACCESSIBILITY_SAMPLE_SIZE, 50),
    maxDatasetsPerCatalog: parseIntEnv(env.AGORA_PIPELINE_MAX_DATASETS, 10_000),
    ckanPageSize: parseIntEnv(env.AGORA_PIPELINE_CKAN_PAGE_SIZE, 1000),
  };
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
