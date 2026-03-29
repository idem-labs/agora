/**
 * Pipeline output types — shared between Platform (writer) and Web (reader).
 */
import type { QualityDimension, QualityScore } from "./quality.js";

/** Aggregated scores and stats for a single catalog. */
export interface CatalogSummary {
  id: string;
  name: string;
  url: string;
  protocol: "ckan" | "socrata" | "dcat";
  country: string;
  language: string;
  datasetCount: number;
  resourceCount: number;
  scores: {
    overall: number;
  } & Record<QualityDimension, number>;
  stats: {
    accessiblePct: number;
    medianFreshnessDays: number | null;
    topFormats: Array<{ format: string; count: number }>;
  };
  scoredAt: string;
  /** Scoring coverage 0-1 (1 = all datasets scored). Tier 3 catalogs may be partial. */
  coverage?: number;
  /** Number of datasets actually scored (may be < datasetCount for tier 3). */
  datasetsScored?: number;
  /** Processing tier: "detail" stores per-dataset scores, "aggregate" stores only averages. */
  tier?: "detail" | "aggregate";
  /** Processing status: "scored" = has real scores, "pending" = not yet processed. */
  status?: "scored" | "pending";
}

/** Per-catalog file: all dataset-level scores. */
export interface CatalogScores {
  catalogId: string;
  scoredAt: string;
  datasetCount: number;
  datasets: QualityScore[];
  /** Scoring coverage 0-1. */
  coverage?: number;
}

/** Global run metadata. */
export interface PipelineMeta {
  version: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  catalogsProcessed: number;
  catalogsFailed: number;
  totalDatasets: number;
  totalResources: number;
  config: {
    concurrency: number;
    headTimeoutMs: number;
    freshnessHalfLifeDays: number;
    accessibilitySampleSize: number;
  };
  /** Budget tracking (incremental pipeline). */
  budgetMin?: number;
  budgetUsedMin?: number;
  catalogsSkipped?: number;
  catalogsUnreachable?: number;
  catalogsFresh?: number;
  /** Coverage breakdown by tier. */
  globalCoverage?: {
    tier12: { catalogs: number; complete: number; pct: number };
    tier3: { catalogs: number; avgCoverage: number };
  };
}

/** Top-level catalogs.json output. */
export interface CatalogsOutput {
  generatedAt: string;
  catalogs: CatalogSummary[];
}
