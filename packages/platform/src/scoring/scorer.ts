import type { DatasetRecord, DimensionScore, QualityDimension, QualityScore } from "@agora/sdk";
import { QUALITY_WEIGHTS } from "@agora/sdk";

export interface Scorer {
  readonly dimension: QualityDimension;
  score(dataset: DatasetRecord): Promise<DimensionScore>;
}

/** Active dimensions (usability deferred to Phase 5 — needs telemetry). */
const ACTIVE_DIMENSIONS: QualityDimension[] = [
  "accessibility",
  "structure",
  "freshness",
  "completeness",
];

/** Re-normalized weights excluding usability. Sum = 1.0. */
export function normalizedWeights(): Record<string, number> {
  const sum = ACTIVE_DIMENSIONS.reduce((s, d) => s + QUALITY_WEIGHTS[d], 0);
  const result: Record<string, number> = {};
  for (const d of ACTIVE_DIMENSIONS) {
    result[d] = QUALITY_WEIGHTS[d] / sum;
  }
  return result;
}

/** Weighted average of dimension scores using re-normalized weights. */
export function computeOverall(dimensions: DimensionScore[]): number {
  const weights = normalizedWeights();
  let total = 0;
  for (const d of dimensions) {
    total += d.score * (weights[d.dimension] ?? 0);
  }
  return Math.round(total * 1000) / 1000;
}

/** Assemble a QualityScore from dimension results. */
export function buildQualityScore(
  datasetId: string,
  dimensions: DimensionScore[],
): QualityScore {
  return {
    datasetId,
    overall: computeOverall(dimensions),
    dimensions,
    lastChecked: new Date().toISOString(),
  };
}
