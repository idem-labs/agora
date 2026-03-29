/**
 * TENTATIVE — These quality score types are a draft for Platform integration (Phases 4-5).
 * They will be revisited when we design the Platform in detail.
 */
import { z } from "zod/v4";

export const QualityDimension = z.enum([
  "accessibility",
  "structure",
  "freshness",
  "usability",
  "completeness",
]);
export type QualityDimension = z.infer<typeof QualityDimension>;

export const DimensionScore = z.object({
  dimension: QualityDimension,
  score: z.number().min(0).max(1),
  evidence: z.record(z.string(), z.unknown()).optional(),
  calculatedAt: z.iso.datetime(),
});
export type DimensionScore = z.infer<typeof DimensionScore>;

export const QualityScore = z.object({
  datasetId: z.string(),
  title: z.string().optional(),
  organization: z.string().optional(),
  overall: z.number().min(0).max(1),
  dimensions: z.array(DimensionScore),
  lastChecked: z.iso.datetime(),
});
export type QualityScore = z.infer<typeof QualityScore>;

/** Weights per dimension — active weights sum to 1.0 (usability deferred to Phase 5). */
export const QUALITY_WEIGHTS: Record<QualityDimension, number> = {
  accessibility: 0.3125,
  structure: 0.3125,
  freshness: 0.25,
  completeness: 0.125,
  usability: 0,
};
