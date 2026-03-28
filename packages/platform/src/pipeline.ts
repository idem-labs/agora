/**
 * Incremental scoring pipeline orchestrator.
 *
 * Processes catalogs in priority order with budget tracking:
 * 1. Tier 1+2 (detail): per-dataset scoring with incremental diffing
 * 2. Tier 3 (aggregate): round-robin chunks with timestamp cursor
 */
import { VERSION } from "@agora/sdk";
import type {
  CatalogSummary,
  CatalogScores,
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
import type { CatalogState } from "./state/types.js";
import { readCatalogState, writeCatalogState, readDatasetsFile } from "./state/state-store.js";
import { BudgetTimer } from "./budget.js";
import { classifyCatalogs } from "./pipeline/catalog-classifier.js";
import { shouldSkipCatalog, recordFailure } from "./pipeline/failure-handler.js";
import { cleanupOrphanedCatalogs } from "./pipeline/cleanup.js";
import { processDetailCatalog } from "./pipeline/detail-processor.js";
import { processAggregateCatalog } from "./pipeline/aggregate-processor.js";
import { AccessibilityScorer } from "./scoring/accessibility-scorer.js";
import { CompletenessScorer } from "./scoring/completeness-scorer.js";
import { FreshnessScorer } from "./scoring/freshness-scorer.js";
import { StructureScorer } from "./scoring/structure-scorer.js";
import {
  writeCatalogScores,
  writeCatalogDatasets,
  writeCatalogsIndex,
  writeMeta,
} from "./output/writer.js";

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
  const budget = new BudgetTimer(config.budgetMin);

  logger.info("Pipeline starting (incremental)", {
    presets: config.presets,
    priorityPresets: config.priorityPresets,
    detailPresets: config.detailPresets,
    budgetMin: config.budgetMin,
  });

  // ── Resolve adapters ──
  let adapterEntries: Array<{ adapter: CatalogAdapter; entry: CatalogEntry }>;

  if (overrides?.adapters) {
    adapterEntries = overrides.adapters;
  } else {
    const entries = resolveActiveCatalogs(config.presets, config.catalogIds);
    const registry = new CatalogRegistry(entries, logger, {
      ckanPageSize: config.ckanPageSize,
    });
    adapterEntries = registry.listAdapters().map((adapter) => ({
      adapter,
      entry: entries.find((e) => e.id === adapter.catalog.id)!,
    }));
  }

  // ── Classify into tiers and sort by priority ──
  const allEntries = adapterEntries.map((a) => a.entry);
  // When using test overrides, default all to "detail" to match previous behavior
  const classified = overrides?.adapters
    ? allEntries.map((entry) => ({ entry, tier: "detail" as const }))
    : classifyCatalogs(allEntries, config.detailPresets, config.priorityPresets);
  const adapterMap = new Map(adapterEntries.map((a) => [a.entry.id, a.adapter]));
  const activeCatalogIds = new Set(allEntries.map((e) => e.id));

  logger.info("Catalogs classified", {
    detail: classified.filter((c) => c.tier === "detail").length,
    aggregate: classified.filter((c) => c.tier === "aggregate").length,
    total: classified.length,
  });

  // ── Cleanup orphaned catalog data ──
  const removed = await cleanupOrphanedCatalogs(config.outputDir, activeCatalogIds, logger);
  if (removed.length > 0) {
    logger.info("Orphaned catalogs cleaned", { removed });
  }

  // ── Create scorers ──
  const pureScorers = [
    new CompletenessScorer(),
    new FreshnessScorer(config.freshnessHalfLifeDays),
    new StructureScorer(),
  ];
  const accessibilityScorer = new AccessibilityScorer({
    headTimeoutMs: config.headTimeoutMs,
    concurrency: config.concurrency,
  });

  // ── Process catalogs sequentially ──
  const summaries: CatalogSummary[] = [];
  const allScores: CatalogScores[] = [];
  let catalogsProcessed = 0;
  let catalogsSkipped = 0;
  let catalogsUnreachable = 0;
  let catalogsFresh = 0;
  let catalogsFailed = 0;
  let totalDatasetsScored = 0;

  for (const { entry, tier } of classified) {
    if (budget.isExhausted()) {
      logger.info("Budget exhausted, stopping", { remainingMin: budget.remainingMin() });
      break;
    }

    const adapter = adapterMap.get(entry.id)!;
    const state = await readCatalogState(config.outputDir, entry.id);

    // Check if catalog should be skipped (unreachable)
    const skipDecision = shouldSkipCatalog(state);
    if (skipDecision.skip) {
      logger.info("Skipping catalog", { catalogId: entry.id, reason: skipDecision.reason });
      catalogsSkipped++;
      catalogsUnreachable++;
      // Keep existing summary if available
      if (state) {
        const existingSummary = buildFallbackSummary(entry, state);
        if (existingSummary) summaries.push(existingSummary);
      }
      continue;
    }

    try {
      if (tier === "detail") {
        const existingDatasets = await readDatasetsFile(config.outputDir, entry.id);
        const result = await processDetailCatalog({
          adapter,
          entry,
          state: state?.tier === "detail" ? state : null,
          existingDatasets,
          pureScorers,
          accessibilityScorer,
          config,
          logger,
        });

        summaries.push(result.summary);
        allScores.push(result.scores);
        totalDatasetsScored += result.datasetsScored;

        // Write incremental output
        await writeCatalogScores(config.outputDir, entry.id, result.scores);
        await writeCatalogDatasets(config.outputDir, entry.id, result.datasets);
        await writeCatalogState(config.outputDir, entry.id, result.state);

        catalogsProcessed++;
        logger.info("Detail catalog completed", {
          catalogId: entry.id,
          datasetsScored: result.datasetsScored,
          budgetRemaining: Math.round(budget.remainingMin()),
        });
      } else {
        const result = await processAggregateCatalog({
          adapter,
          entry,
          state: state?.tier === "aggregate" ? state : null,
          pureScorers,
          accessibilityScorer,
          config,
          logger,
        });

        summaries.push(result.summary);
        allScores.push(result.scores);
        totalDatasetsScored += result.datasetsScored;

        if (result.skipped) {
          catalogsFresh++;
          catalogsSkipped++;
        } else {
          // Write incremental output
          await writeCatalogScores(config.outputDir, entry.id, result.scores);
          await writeCatalogState(config.outputDir, entry.id, result.state);
          catalogsProcessed++;
        }

        logger.info("Aggregate catalog completed", {
          catalogId: entry.id,
          datasetsScored: result.datasetsScored,
          coverage: result.state.coverage,
          skipped: result.skipped,
          budgetRemaining: Math.round(budget.remainingMin()),
        });
      }
    } catch (error) {
      catalogsFailed++;
      logger.error("Catalog processing failed", {
        catalogId: entry.id,
        tier,
        error: String(error),
      });

      // Record failure
      const updatedState = recordFailure(
        state ?? { tier, status: "ok", consecutiveFailures: 0, lastRunAt: null } as CatalogState,
        String(error),
      );
      await writeCatalogState(config.outputDir, entry.id, updatedState);
    }
  }

  // ── Write global output ──
  const completedAt = new Date();

  const catalogsOutput: CatalogsOutput = {
    generatedAt: completedAt.toISOString(),
    catalogs: summaries,
  };
  await writeCatalogsIndex(config.outputDir, catalogsOutput);

  const detailCatalogs = classified.filter((c) => c.tier === "detail");
  const aggregateCatalogs = classified.filter((c) => c.tier === "aggregate");

  const meta: PipelineMeta = {
    version: VERSION,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    catalogsProcessed,
    catalogsFailed,
    totalDatasets: summaries.reduce((s, c) => s + c.datasetCount, 0),
    totalResources: summaries.reduce((s, c) => s + c.resourceCount, 0),
    config: {
      concurrency: config.concurrency,
      headTimeoutMs: config.headTimeoutMs,
      freshnessHalfLifeDays: config.freshnessHalfLifeDays,
      accessibilitySampleSize: config.accessibilitySampleSize,
    },
    budgetMin: config.budgetMin,
    budgetUsedMin: Math.round(budget.usedMin() * 10) / 10,
    catalogsSkipped,
    catalogsUnreachable,
    catalogsFresh,
    globalCoverage: {
      tier12: {
        catalogs: detailCatalogs.length,
        complete: detailCatalogs.length - catalogsFailed,
        pct: 1.0,
      },
      tier3: {
        catalogs: aggregateCatalogs.length,
        avgCoverage: computeAvgCoverage(summaries.filter((s) => s.tier === "aggregate")),
      },
    },
  };
  await writeMeta(config.outputDir, meta);

  logger.info("Pipeline completed", {
    catalogsProcessed,
    catalogsSkipped,
    catalogsFailed,
    datasetsScored: totalDatasetsScored,
    durationMs: meta.durationMs,
    budgetUsedMin: meta.budgetUsedMin,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeAvgCoverage(summaries: CatalogSummary[]): number {
  if (summaries.length === 0) return 0;
  const total = summaries.reduce((s, c) => s + (c.coverage ?? 0), 0);
  return Math.round((total / summaries.length) * 1000) / 1000;
}

function buildFallbackSummary(
  entry: CatalogEntry,
  _state: CatalogState,
): CatalogSummary | null {
  // Return a minimal summary for unreachable catalogs so they still appear in the index
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    protocol: entry.protocol,
    country: entry.country,
    language: entry.language,
    datasetCount: 0,
    resourceCount: 0,
    scores: {
      overall: 0,
      accessibility: 0,
      structure: 0,
      freshness: 0,
      completeness: 0,
      usability: 0,
    },
    stats: { accessiblePct: 0, medianFreshnessDays: null, topFormats: [] },
    scoredAt: new Date().toISOString(),
    coverage: 0,
    datasetsScored: 0,
    tier: _state.tier,
  };
}
