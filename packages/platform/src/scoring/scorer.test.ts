import { describe, it, expect } from "vitest";
import { normalizedWeights, computeOverall, buildQualityScore } from "./scorer.js";
import type { DimensionScore, QualityDimension } from "@agora/sdk";

describe("normalizedWeights", () => {
  it("sums to 1.0", () => {
    const weights = normalizedWeights();
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("excludes usability", () => {
    const weights = normalizedWeights();
    expect(weights).not.toHaveProperty("usability");
  });

  it("preserves relative order from QUALITY_WEIGHTS", () => {
    const weights = normalizedWeights();
    // accessibility and structure tied at 0.25 each → 0.3125 normalized
    expect(weights.accessibility).toBeCloseTo(weights.structure);
    // freshness = 0.2 → 0.25 normalized
    expect(weights.freshness).toBeLessThan(weights.accessibility!);
    // completeness = 0.1 → 0.125 normalized
    expect(weights.completeness).toBeLessThan(weights.freshness!);
  });
});

describe("computeOverall", () => {
  function dim(dimension: string, score: number): DimensionScore {
    return { dimension: dimension as QualityDimension, score, calculatedAt: "2026-01-01T00:00:00Z" };
  }

  it("returns 1.0 for all perfect scores", () => {
    const dims = [
      dim("accessibility", 1),
      dim("structure", 1),
      dim("freshness", 1),
      dim("completeness", 1),
    ];
    expect(computeOverall(dims)).toBe(1);
  });

  it("returns 0 for all zero scores", () => {
    const dims = [
      dim("accessibility", 0),
      dim("structure", 0),
      dim("freshness", 0),
      dim("completeness", 0),
    ];
    expect(computeOverall(dims)).toBe(0);
  });

  it("computes weighted average correctly", () => {
    const dims = [
      dim("accessibility", 0.8),
      dim("structure", 0.6),
      dim("freshness", 0.4),
      dim("completeness", 0.2),
    ];
    const weights = normalizedWeights();
    const expected =
      0.8 * weights.accessibility! +
      0.6 * weights.structure! +
      0.4 * weights.freshness! +
      0.2 * weights.completeness!;
    expect(computeOverall(dims)).toBeCloseTo(expected, 3);
  });

  it("ignores usability dimension if accidentally included", () => {
    const dims = [
      dim("accessibility", 1),
      dim("structure", 1),
      dim("freshness", 1),
      dim("completeness", 1),
      dim("usability", 0),
    ];
    // usability has weight 0 in normalized → should not reduce overall
    expect(computeOverall(dims)).toBe(1);
  });
});

describe("buildQualityScore", () => {
  it("assembles valid QualityScore", () => {
    const dims: DimensionScore[] = [
      { dimension: "accessibility", score: 0.9, calculatedAt: "2026-01-01T00:00:00Z" },
      { dimension: "structure", score: 0.8, calculatedAt: "2026-01-01T00:00:00Z" },
      { dimension: "freshness", score: 0.7, calculatedAt: "2026-01-01T00:00:00Z" },
      { dimension: "completeness", score: 0.6, calculatedAt: "2026-01-01T00:00:00Z" },
    ];
    const qs = buildQualityScore("cat:ds1", dims);

    expect(qs.datasetId).toBe("cat:ds1");
    expect(qs.overall).toBeGreaterThan(0);
    expect(qs.overall).toBeLessThanOrEqual(1);
    expect(qs.dimensions).toHaveLength(4);
    expect(qs.lastChecked).toBeTruthy();
  });
});
