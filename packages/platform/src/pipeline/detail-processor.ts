/**
 * Detail processor — handles tier 1+2 catalogs with per-dataset scoring.
 * Incremental: only scores new, modified, or expired datasets.
 */
import type {
  DatasetRecord,
  DimensionScore,
  QualityScore,
  CatalogSummary,
  CatalogScores,
} from "@agora/sdk";
import type { CatalogAdapter, CatalogEntry, Logger } from "agora-mcp/lib";
import type { PipelineConfig } from "../config.js";
import type { DetailCatalogState, DatasetEntry, DatasetsFile } from "../state/types.js";
import { AccessibilityScorer } from "../scoring/accessibility-scorer.js";
import { computeOverall } from "../scoring/scorer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scorer {
  score(ds: DatasetRecord): Promise<DimensionScore>;
}

export interface DetailProcessorArgs {
  adapter: CatalogAdapter;
  entry: CatalogEntry;
  state: DetailCatalogState | null;
  existingDatasets: DatasetsFile | null;
  pureScorers: Scorer[];
  accessibilityScorer: AccessibilityScorer;
  config: PipelineConfig;
  logger: Logger;
}

export interface DetailProcessorResult {
  summary: CatalogSummary;
  scores: CatalogScores;
  datasets: DatasetsFile;
  state: DetailCatalogState;
  datasetsScored: number;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export async function processDetailCatalog(
  args: DetailProcessorArgs,
): Promise<DetailProcessorResult> {
  const { adapter, entry, existingDatasets, pureScorers, accessibilityScorer, config, logger } = args;
  const catalogId = adapter.catalog.id;
  const rescoreMs = config.rescoreDays * 86_400_000;
  const now = Date.now();

  logger.info("Detail: fetching datasets", { catalogId });

  // 1. Fetch all current datasets from API
  const apiDatasets = new Map<string, DatasetRecord>();
  for await (const ds of adapter.listDatasets()) {
    apiDatasets.set(ds.externalId, ds);
  }

  logger.info("Detail: datasets fetched", { catalogId, count: apiDatasets.size });

  // 2. Build lookup of existing scored datasets
  const existingMap = new Map<string, DatasetEntry>();
  if (existingDatasets) {
    for (const de of existingDatasets.datasets) {
      existingMap.set(de.externalId, de);
    }
  }

  // 3. Diff: classify each dataset
  const toScore: DatasetRecord[] = [];
  const kept: DatasetEntry[] = [];

  for (const [externalId, ds] of apiDatasets) {
    const existing = existingMap.get(externalId);

    if (!existing) {
      // New dataset
      toScore.push(ds);
      continue;
    }

    const modified = ds.modifiedAt && existing.modifiedAt
      ? new Date(ds.modifiedAt).getTime() > new Date(existing.modifiedAt).getTime()
      : false;

    if (modified) {
      // Modified since last scored
      toScore.push(ds);
      continue;
    }

    const expired = (now - new Date(existing.lastScoredAt).getTime()) > rescoreMs;
    if (expired) {
      // Score has expired
      toScore.push(ds);
      continue;
    }

    // Fresh — keep existing score
    kept.push(existing);
  }

  // Deleted datasets: in existing but not in API → simply not included

  logger.info("Detail: diff computed", {
    catalogId,
    new: toScore.length - (apiDatasets.size - existingMap.size),
    toScore: toScore.length,
    kept: kept.length,
    deleted: existingMap.size - kept.length - (toScore.length - (apiDatasets.size - existingMap.size)),
  });

  // 4. Score the delta datasets
  const newEntries: DatasetEntry[] = [];
  const scoredAt = new Date().toISOString();

  for (const ds of toScore) {
    const dims = await Promise.all(pureScorers.map((s) => s.score(ds)));
    const accDim = await accessibilityScorer.score(ds);
    dims.push(accDim);

    const overall = computeOverall(dims);
    const qualityScore: QualityScore = {
      datasetId: ds.id,
      title: ds.title,
      organization: ds.organization,
      overall,
      dimensions: dims,
      lastChecked: scoredAt,
    };

    newEntries.push({
      datasetId: ds.id,
      externalId: ds.externalId,
      modifiedAt: ds.modifiedAt ?? null,
      lastScoredAt: scoredAt,
      score: qualityScore,
    });
  }

  // 5. Merge: kept + newly scored
  const allEntries = [...kept, ...newEntries];
  const allQualityScores = allEntries.map((e) => e.score);

  // 6. Compute catalog aggregates
  const summary = buildSummary(entry, allEntries, allQualityScores, apiDatasets.size);
  const catalogScores: CatalogScores = {
    catalogId,
    scoredAt,
    datasetCount: apiDatasets.size,
    datasets: allQualityScores,
    coverage: 1.0,
  };

  const datasetsFile: DatasetsFile = {
    catalogId,
    updatedAt: scoredAt,
    datasets: allEntries,
  };

  const state: DetailCatalogState = {
    tier: "detail",
    status: "ok",
    consecutiveFailures: 0,
    lastRunAt: scoredAt,
  };

  return {
    summary,
    scores: catalogScores,
    datasets: datasetsFile,
    state,
    datasetsScored: newEntries.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(
  entry: CatalogEntry,
  entries: DatasetEntry[],
  scores: QualityScore[],
  totalDatasets: number,
): CatalogSummary {
  const dimSums: Record<string, { sum: number; count: number }> = {};
  let totalResources = 0;
  let accessibleCount = 0;
  let checkedCount = 0;
  const freshnessDays: number[] = [];
  const formatCounts: Record<string, number> = {};

  for (const qs of scores) {
    for (const dim of qs.dimensions) {
      const d = dimSums[dim.dimension] ?? { sum: 0, count: 0 };
      d.sum += dim.score;
      d.count++;
      dimSums[dim.dimension] = d;

      if (dim.dimension === "freshness") {
        const ev = dim.evidence as { daysSinceModified?: number } | undefined;
        if (ev?.daysSinceModified != null) freshnessDays.push(ev.daysSinceModified);
      }

      if (dim.dimension === "accessibility") {
        const ev = dim.evidence as { accessible?: number; checked?: number } | undefined;
        if (ev) {
          accessibleCount += ev.accessible ?? 0;
          checkedCount += ev.checked ?? 0;
        }
      }
    }
  }

  // Count resources and formats from entries' scores
  for (const entry of entries) {
    const structDim = entry.score.dimensions.find((d) => d.dimension === "structure");
    const ev = structDim?.evidence as { formats?: string[] } | undefined;
    if (ev?.formats) {
      for (const fmt of ev.formats) {
        formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
        totalResources++;
      }
    }
  }

  const overallAvg = scores.length > 0
    ? scores.reduce((s, q) => s + q.overall, 0) / scores.length
    : 0;

  const accessiblePct = checkedCount > 0 ? accessibleCount / checkedCount : 0;

  const sorted = [...freshnessDays].sort((a, b) => a - b);
  const medianFreshnessDays = sorted.length > 0
    ? sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    : null;

  const topFormats = Object.entries(formatCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([format, count]) => ({ format, count }));

  const dimAvg = (dim: string) => {
    const d = dimSums[dim];
    return d && d.count > 0 ? Math.round((d.sum / d.count) * 1000) / 1000 : 0;
  };

  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    protocol: entry.protocol,
    country: entry.country,
    language: entry.language,
    datasetCount: totalDatasets,
    resourceCount: totalResources,
    scores: {
      overall: Math.round(overallAvg * 1000) / 1000,
      accessibility: dimAvg("accessibility"),
      structure: dimAvg("structure"),
      freshness: dimAvg("freshness"),
      completeness: dimAvg("completeness"),
      usability: 0,
    },
    stats: {
      accessiblePct: Math.round(accessiblePct * 1000) / 1000,
      medianFreshnessDays,
      topFormats,
    },
    scoredAt: new Date().toISOString(),
    coverage: 1.0,
    datasetsScored: scores.length,
    tier: "detail",
  };
}
