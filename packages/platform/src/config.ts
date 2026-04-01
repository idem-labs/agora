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
  /** Max datasets per catalog for accessibility HEAD checks (0 = all). Reserved for future sampling. */
  accessibilitySampleSize: number;
  /** CKAN page size for bulk listing */
  ckanPageSize: number;
  /** Time budget in minutes for the entire pipeline run */
  budgetMin: number;
  /** Preset processing order (first = highest priority) */
  priorityPresets: string[];
  /** Presets that get detail-tier scoring (per-dataset scores stored) */
  detailPresets: string[];
  /** Days before a completed sweep expires and needs re-scoring */
  rescoreDays: number;
  /** Datasets per catalog per run for aggregate tier (round-robin chunk) */
  chunkSize: number;
  /** Max time in minutes for a single catalog's scoring loop before moving on. */
  catalogTimeoutMin: number;
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
    ckanPageSize: parseIntEnv(env.AGORA_PIPELINE_CKAN_PAGE_SIZE, 1000),
    budgetMin: parseIntEnv(env.AGORA_PIPELINE_BUDGET_MIN, 50),
    priorityPresets: parseListEnv(env.AGORA_PIPELINE_PRIORITY, ["argentina", "latam", "all"]),
    detailPresets: parseListEnv(env.AGORA_PIPELINE_DETAIL_PRESETS, ["argentina", "latam"]),
    rescoreDays: parseIntEnv(env.AGORA_PIPELINE_RESCORE_DAYS, 7),
    chunkSize: parseIntEnv(env.AGORA_PIPELINE_CHUNK_SIZE, 1000),
    catalogTimeoutMin: parseIntEnv(env.AGORA_PIPELINE_CATALOG_TIMEOUT_MIN, 15),
  };
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseListEnv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
