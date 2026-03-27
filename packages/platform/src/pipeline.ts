import { VERSION } from "@agora/sdk";
import type {
  DatasetRecord,
  DimensionScore,
  QualityScore,
  CatalogScores,
  CatalogSummary,
  CatalogsOutput,
  PipelineMeta,
} from "@agora/sdk";
import {
  CatalogRegistry,
  resolveActiveCatalogs,
  createLogger,
  type CatalogAdapter,
  type CatalogEntry,
  type Logger,
} from "agora-mcp/lib";
import type { PipelineConfig } from "./config.js";
import { AccessibilityScorer } from "./scoring/accessibility-scorer.js";
import { CompletenessScorer } from "./scoring/completeness-scorer.js";
import { FreshnessScorer } from "./scoring/freshness-scorer.js";
import { StructureScorer } from "./scoring/structure-scorer.js";
import { computeOverall } from "./scoring/scorer.js";
import { writeOutput } from "./output/writer.js";

/** Optional overrides for testing (inject mock adapters). */
export interface PipelineOverrides {
  adapters?: Array<{ adapter: CatalogAdapter; entry: CatalogEntry }>;
  logger?: Logger;
}

export async function runPipeline(
  config: PipelineConfig,
  overrides?: PipelineOverrides,
): Promise<void> {
  const startedAt = new Date();
  const logger = overrides?.logger ?? createLogger(config.logLevel);

  logger.info("Pipeline starting", {
    presets: config.presets,
    catalogs: config.catalogIds,
  });

  // Resolve adapters — from overrides (testing) or from catalog directory (production)
  let adapterEntries: Array<{ adapter: CatalogAdapter; entry: CatalogEntry }>;

  if (overrides?.adapters) {
    adapterEntries = overrides.adapters;
  } else {
    const entries = resolveActiveCatalogs(config.presets, config.catalogIds);
    const registry = new CatalogRegistry(entries, logger);
    adapterEntries = registry.listAdapters().map((adapter) => ({
      adapter,
      entry: entries.find((e) => e.id === adapter.catalog.id)!,
    }));
  }

  logger.info("Catalogs resolved", { count: adapterEntries.length });

  // Create scorers
  const pureScorers = [
    new CompletenessScorer(),
    new FreshnessScorer(config.freshnessHalfLifeDays),
    new StructureScorer(),
  ];
  const accessibilityScorer = new AccessibilityScorer({
    headTimeoutMs: config.headTimeoutMs,
    concurrency: config.concurrency,
  });

  const catalogSummaries: CatalogSummary[] = [];
  const allCatalogScores: CatalogScores[] = [];
  let totalDatasets = 0;
  let totalResources = 0;
  let catalogsFailed = 0;

  const catalogResults = await Promise.allSettled(
    adapterEntries.map(({ adapter, entry }) =>
      processCatalog({
        adapter,
        entry,
        pureScorers,
        accessibilityScorer,
        sampleSize: config.accessibilitySampleSize,
        logger,
      }),
    ),
  );

  for (let i = 0; i < catalogResults.length; i++) {
    const result = catalogResults[i];
    if (result.status === "fulfilled") {
      catalogSummaries.push(result.value.summary);
      allCatalogScores.push(result.value.scores);
      totalDatasets += result.value.scores.datasetCount;
      totalResources += result.value.summary.resourceCount;
    } else {
      catalogsFailed++;
      logger.error("Catalog processing failed", {
        catalogId: adapterEntries[i].adapter.catalog.id,
        error: String(result.reason),
      });
    }
  }

  const completedAt = new Date();

  const meta: PipelineMeta = {
    version: VERSION,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    catalogsProcessed: catalogSummaries.length,
    catalogsFailed,
    totalDatasets,
    totalResources,
    config: {
      concurrency: config.concurrency,
      headTimeoutMs: config.headTimeoutMs,
      freshnessHalfLifeDays: config.freshnessHalfLifeDays,
      accessibilitySampleSize: config.accessibilitySampleSize,
    },
  };

  const catalogsOutput: CatalogsOutput = {
    generatedAt: completedAt.toISOString(),
    catalogs: catalogSummaries,
  };

  await writeOutput({
    outputDir: config.outputDir,
    catalogs: catalogsOutput,
    catalogScores: allCatalogScores,
    meta,
  });

  logger.info("Pipeline completed", {
    catalogs: catalogSummaries.length,
    datasets: totalDatasets,
    resources: totalResources,
    durationMs: meta.durationMs,
  });
}

// ── Internal ──

interface ProcessCatalogArgs {
  adapter: CatalogAdapter;
  entry: CatalogEntry;
  pureScorers: Array<{ score(ds: DatasetRecord): Promise<DimensionScore> }>;
  accessibilityScorer: AccessibilityScorer;
  sampleSize: number;
  logger: Logger;
}

async function processCatalog(args: ProcessCatalogArgs): Promise<{
  summary: CatalogSummary;
  scores: CatalogScores;
}> {
  const { adapter, entry, pureScorers, accessibilityScorer, sampleSize, logger } = args;
  const catalogId = adapter.catalog.id;

  logger.info("Fetching datasets", { catalogId });

  // Collect all datasets
  const datasets: DatasetRecord[] = [];
  for await (const dataset of adapter.listDatasets()) {
    datasets.push(dataset);
  }

  logger.info("Datasets fetched", { catalogId, count: datasets.length });

  // Score pure dimensions for all datasets
  const datasetScores: QualityScore[] = [];
  const allFreshnessDays: number[] = [];
  const formatCounts: Record<string, number> = {};
  let totalResources = 0;

  for (const dataset of datasets) {
    const dims = await Promise.all(pureScorers.map((s) => s.score(dataset)));

    // Track freshness stats
    const fEvidence = dims.find((d) => d.dimension === "freshness")?.evidence as
      | { daysSinceModified?: number }
      | undefined;
    if (fEvidence?.daysSinceModified != null) {
      allFreshnessDays.push(fEvidence.daysSinceModified);
    }

    // Track format stats
    for (const r of dataset.resources ?? []) {
      const fmt = (r.format || "unknown").toUpperCase();
      formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
      totalResources++;
    }

    datasetScores.push({
      datasetId: dataset.id,
      overall: 0, // recalculated after accessibility
      dimensions: dims,
      lastChecked: new Date().toISOString(),
    });
  }

  // Sample datasets for accessibility HEAD checks
  const sampled =
    sampleSize > 0 && datasets.length > sampleSize
      ? sampleIndices(datasets.length, sampleSize)
      : new Set(Array.from({ length: datasets.length }, (_, i) => i));

  logger.info("Scoring accessibility", {
    catalogId,
    sampled: sampled.size,
    total: datasets.length,
  });

  // Score accessibility on sampled datasets
  let accessibilitySum = 0;
  let accessibilityCount = 0;
  let accessibleResourceCount = 0;
  let checkedResourceCount = 0;

  const accessibilityResults = await Promise.all(
    Array.from(sampled).map((idx) =>
      accessibilityScorer.score(datasets[idx]).then((aScore) => ({ idx, aScore })),
    ),
  );

  for (const { idx, aScore } of accessibilityResults) {
    datasetScores[idx].dimensions.push(aScore);
    accessibilitySum += aScore.score;
    accessibilityCount++;

    const ev = aScore.evidence as { accessible?: number; checked?: number } | undefined;
    if (ev) {
      accessibleResourceCount += ev.accessible ?? 0;
      checkedResourceCount += ev.checked ?? 0;
    }
  }

  // Non-sampled datasets get catalog average accessibility
  const avgAccessibility =
    accessibilityCount > 0 ? accessibilitySum / accessibilityCount : 0;

  for (let i = 0; i < datasetScores.length; i++) {
    if (!sampled.has(i)) {
      datasetScores[i].dimensions.push({
        dimension: "accessibility",
        score: Math.round(avgAccessibility * 1000) / 1000,
        evidence: { estimated: true, catalogAverage: avgAccessibility },
        calculatedAt: new Date().toISOString(),
      });
    }

    // Recalculate overall with all 4 dimensions
    datasetScores[i].overall = computeOverall(datasetScores[i].dimensions);
  }

  // Aggregate catalog summary
  const dimAverages = aggregateDimensionAverages(datasetScores);
  const overallAvg =
    datasetScores.length > 0
      ? datasetScores.reduce((s, d) => s + d.overall, 0) / datasetScores.length
      : 0;

  const accessiblePct =
    checkedResourceCount > 0 ? accessibleResourceCount / checkedResourceCount : 0;

  const medianFreshnessDays =
    allFreshnessDays.length > 0 ? median(allFreshnessDays) : null;

  const topFormats = Object.entries(formatCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([format, count]) => ({ format, count }));

  const scoredAt = new Date().toISOString();

  const summary: CatalogSummary = {
    id: catalogId,
    name: entry.name,
    url: entry.url,
    protocol: entry.protocol,
    country: entry.country,
    language: entry.language,
    datasetCount: datasets.length,
    resourceCount: totalResources,
    scores: {
      overall: Math.round(overallAvg * 1000) / 1000,
      accessibility: dimAverages.accessibility ?? 0,
      structure: dimAverages.structure ?? 0,
      freshness: dimAverages.freshness ?? 0,
      completeness: dimAverages.completeness ?? 0,
      usability: 0,
    },
    stats: {
      accessiblePct: Math.round(accessiblePct * 1000) / 1000,
      medianFreshnessDays,
      topFormats,
    },
    scoredAt,
  };

  const scores: CatalogScores = {
    catalogId,
    scoredAt,
    datasetCount: datasets.length,
    datasets: datasetScores,
  };

  logger.info("Catalog scored", {
    catalogId,
    datasets: datasets.length,
    overall: summary.scores.overall,
  });

  return { summary, scores };
}

/** Fisher-Yates shuffle → take first `size` indices. */
function sampleIndices(total: number, size: number): Set<number> {
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, size));
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function aggregateDimensionAverages(scores: QualityScore[]): Record<string, number> {
  if (scores.length === 0) return {};

  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const qs of scores) {
    for (const dim of qs.dimensions) {
      sums[dim.dimension] = (sums[dim.dimension] ?? 0) + dim.score;
      counts[dim.dimension] = (counts[dim.dimension] ?? 0) + 1;
    }
  }

  const result: Record<string, number> = {};
  for (const [dim, sum] of Object.entries(sums)) {
    result[dim] = Math.round((sum / counts[dim]) * 1000) / 1000;
  }
  return result;
}
