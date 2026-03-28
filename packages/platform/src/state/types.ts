/**
 * Pipeline state types — internal to the platform package.
 * These track incremental scoring progress between runs.
 */
import type { QualityScore } from "@agora/sdk";

// ---------------------------------------------------------------------------
// Catalog tier and status
// ---------------------------------------------------------------------------

export type CatalogTier = "detail" | "aggregate";
export type CatalogStatus = "ok" | "unreachable" | "pending";

// ---------------------------------------------------------------------------
// Dimension aggregates (running sums for tier 3)
// ---------------------------------------------------------------------------

export interface DimensionAggregate {
  sum: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Per-catalog state (.state.json)
// ---------------------------------------------------------------------------

export interface DetailCatalogState {
  tier: "detail";
  status: CatalogStatus;
  consecutiveFailures: number;
  lastRunAt: string | null;
  lastFailure?: string;
  lastFailureReason?: string;
}

export interface AggregateCatalogState {
  tier: "aggregate";
  status: CatalogStatus;
  /** ISO timestamp cursor for metadata_modified based pagination. null = start from epoch. */
  cursor: string | null;
  /** Total datasets known from the catalog API. */
  totalKnown: number;
  /** Number of datasets processed so far in current sweep. */
  processedCount: number;
  /** Coverage ratio 0-1 (processedCount / totalKnown). */
  coverage: number;
  /** Whether a full sweep has been completed. */
  complete: boolean;
  /** ISO timestamp of last complete sweep (null if never completed). */
  lastCompleteSweep: string | null;
  lastRunAt: string | null;
  consecutiveFailures: number;
  lastFailure?: string;
  lastFailureReason?: string;
  /** Running dimension aggregates (sum/count per dimension). */
  aggregates: Record<string, DimensionAggregate>;
}

export type CatalogState = DetailCatalogState | AggregateCatalogState;

// ---------------------------------------------------------------------------
// Dataset entries for detail tier (datasets.json)
// ---------------------------------------------------------------------------

export interface DatasetEntry {
  datasetId: string;
  externalId: string;
  modifiedAt: string | null;
  lastScoredAt: string;
  score: QualityScore;
}

export interface DatasetsFile {
  catalogId: string;
  updatedAt: string;
  datasets: DatasetEntry[];
}
