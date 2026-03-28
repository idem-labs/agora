/**
 * Aggregate processor — handles tier 3 catalogs with round-robin chunks.
 * Uses timestamp cursor for incremental pagination.
 * Only stores catalog-level averages, not per-dataset scores.
 */
import type {
  DatasetRecord,
  DimensionScore,
  CatalogSummary,
  CatalogScores,
} from "@agora/sdk";
import type { CatalogAdapter, CatalogEntry, Logger } from "agora-mcp/lib";
import type { PipelineConfig } from "../config.js";
import type { AggregateCatalogState, DimensionAggregate } from "../state/types.js";
import { AccessibilityScorer } from "../scoring/accessibility-scorer.js";
import { computeOverall } from "../scoring/scorer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scorer {
  score(ds: DatasetRecord): Promise<DimensionScore>;
}

export interface AggregateProcessorArgs {
  adapter: CatalogAdapter;
  entry: CatalogEntry;
  state: AggregateCatalogState | null;
  pureScorers: Scorer[];
  accessibilityScorer: AccessibilityScorer;
  config: PipelineConfig;
  logger: Logger;
}

export interface AggregateProcessorResult {
  summary: CatalogSummary;
  scores: CatalogScores;
  state: AggregateCatalogState;
  datasetsScored: number;
  skipped: boolean;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export async function processAggregateCatalog(
  args: AggregateProcessorArgs,
): Promise<AggregateProcessorResult> {
  const { adapter, entry, state, pureScorers, accessibilityScorer, config, logger } = args;
  const catalogId = adapter.catalog.id;
  const rescoreMs = config.rescoreDays * 86_400_000;
  const now = Date.now();

  // Determine if we should skip (complete and fresh)
  if (state?.complete && state.lastCompleteSweep) {
    const sweepAge = now - new Date(state.lastCompleteSweep).getTime();
    if (sweepAge < rescoreMs) {
      logger.info("Aggregate: skipping (fresh)", { catalogId, sweepAgeDays: Math.round(sweepAge / 86_400_000) });
      return {
        summary: buildSummaryFromState(entry, state),
        scores: buildEmptyScores(catalogId, state),
        state,
        datasetsScored: 0,
        skipped: true,
      };
    }
    // Expired: start re-sweep from lastCompleteSweep
    logger.info("Aggregate: re-sweep (expired)", { catalogId });
  }

  // Determine cursor
  let cursor: string;
  let aggregates: Record<string, DimensionAggregate>;
  let processedCount: number;

  if (state && !state.complete) {
    // Resume from last cursor
    cursor = state.cursor ?? "1970-01-01T00:00:00Z";
    aggregates = { ...state.aggregates };
    processedCount = state.processedCount;
  } else if (state?.complete && state.lastCompleteSweep) {
    // Re-sweep: only datasets modified since last complete sweep
    cursor = state.lastCompleteSweep;
    aggregates = { ...state.aggregates };
    processedCount = state.processedCount;
  } else {
    // First run: start from epoch
    cursor = "1970-01-01T00:00:00Z";
    aggregates = {};
    processedCount = 0;
  }

  logger.info("Aggregate: processing chunk", { catalogId, cursor, processedCount });

  // Fetch chunk using timestamp cursor
  let chunkCount = 0;
  let lastModifiedAt = cursor;
  let totalKnown = state?.totalKnown ?? 0;
  const iterator = adapter.listDatasetsSince
    ? adapter.listDatasetsSince(cursor)
    : adapter.listDatasets();

  for await (const ds of iterator) {
    if (chunkCount >= config.chunkSize) break;

    // Score with pure scorers
    const dims = await Promise.all(pureScorers.map((s) => s.score(ds)));

    // Sample accessibility: score every 20th dataset in the chunk
    if (chunkCount % 20 === 0) {
      const accDim = await accessibilityScorer.score(ds);
      dims.push(accDim);
    }

    // Accumulate aggregates
    for (const dim of dims) {
      const agg = aggregates[dim.dimension] ?? { sum: 0, count: 0 };
      agg.sum += dim.score;
      agg.count++;
      aggregates[dim.dimension] = agg;
    }

    computeOverall(dims);

    // Track cursor position
    if (ds.modifiedAt && ds.modifiedAt > lastModifiedAt) {
      lastModifiedAt = ds.modifiedAt;
    }

    chunkCount++;
  }

  processedCount += chunkCount;

  // Detect completion: chunk was smaller than requested
  const complete = chunkCount < config.chunkSize;

  // Get total known from API (first page gives count)
  // We approximate with processedCount if complete, else keep previous
  if (complete && processedCount > totalKnown) {
    totalKnown = processedCount;
  } else if (totalKnown === 0) {
    totalKnown = processedCount; // best guess until complete
  }

  const coverage = totalKnown > 0 ? Math.min(1, processedCount / totalKnown) : 0;

  logger.info("Aggregate: chunk complete", {
    catalogId,
    chunkCount,
    processedCount,
    coverage: Math.round(coverage * 1000) / 1000,
    complete,
  });

  const scoredAt = new Date().toISOString();

  const newState: AggregateCatalogState = {
    tier: "aggregate",
    status: "ok",
    cursor: lastModifiedAt,
    totalKnown,
    processedCount,
    coverage,
    complete,
    lastCompleteSweep: complete ? scoredAt : (state?.lastCompleteSweep ?? null),
    lastRunAt: scoredAt,
    consecutiveFailures: 0,
    aggregates,
  };

  return {
    summary: buildSummaryFromState(entry, newState),
    scores: buildEmptyScores(catalogId, newState),
    state: newState,
    datasetsScored: chunkCount,
    skipped: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummaryFromState(
  entry: CatalogEntry,
  state: AggregateCatalogState,
): CatalogSummary {
  const dimAvg = (dim: string) => {
    const agg = state.aggregates[dim];
    return agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 1000) / 1000 : 0;
  };

  const dims = ["accessibility", "structure", "freshness", "completeness"];
  const dimAverages = Object.fromEntries(dims.map((d) => [d, dimAvg(d)]));

  // Compute overall from dimension averages
  const overallDims = dims.map((d) => ({
    dimension: d as "accessibility" | "structure" | "freshness" | "completeness",
    score: dimAverages[d],
    calculatedAt: state.lastRunAt ?? new Date().toISOString(),
  }));
  const overall = computeOverall(overallDims);

  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    protocol: entry.protocol,
    country: entry.country,
    language: entry.language,
    datasetCount: state.totalKnown,
    resourceCount: 0,
    scores: {
      overall,
      accessibility: dimAverages.accessibility ?? 0,
      structure: dimAverages.structure ?? 0,
      freshness: dimAverages.freshness ?? 0,
      completeness: dimAverages.completeness ?? 0,
      usability: 0,
    },
    stats: {
      accessiblePct: 0,
      medianFreshnessDays: null,
      topFormats: [],
    },
    scoredAt: state.lastRunAt ?? new Date().toISOString(),
    coverage: state.coverage,
    datasetsScored: state.processedCount,
    tier: "aggregate",
  };
}

function buildEmptyScores(
  catalogId: string,
  state: AggregateCatalogState,
): CatalogScores {
  return {
    catalogId,
    scoredAt: state.lastRunAt ?? new Date().toISOString(),
    datasetCount: state.totalKnown,
    datasets: [],
    coverage: state.coverage,
  };
}
