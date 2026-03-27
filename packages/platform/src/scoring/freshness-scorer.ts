import type { DatasetRecord, DimensionScore } from "@agora/sdk";
import type { Scorer } from "./scorer.js";

export class FreshnessScorer implements Scorer {
  readonly dimension = "freshness" as const;
  private readonly halfLifeDays: number;
  private readonly lambda: number;

  constructor(halfLifeDays = 180) {
    this.halfLifeDays = halfLifeDays;
    this.lambda = Math.LN2 / halfLifeDays;
  }

  async score(dataset: DatasetRecord): Promise<DimensionScore> {
    const now = Date.now();

    if (!dataset.modifiedAt) {
      return {
        dimension: "freshness",
        score: 0,
        evidence: {
          modifiedAt: null,
          daysSinceModified: null,
          halfLifeDays: this.halfLifeDays,
        },
        calculatedAt: new Date().toISOString(),
      };
    }

    const modifiedMs = new Date(dataset.modifiedAt).getTime();
    const daysSince = Math.max(0, (now - modifiedMs) / (1000 * 60 * 60 * 24));

    const raw = Math.exp(-this.lambda * daysSince);
    const score = Math.round(Math.min(1, raw) * 1000) / 1000;

    return {
      dimension: "freshness",
      score,
      evidence: {
        modifiedAt: dataset.modifiedAt,
        daysSinceModified: Math.round(daysSince),
        halfLifeDays: this.halfLifeDays,
      },
      calculatedAt: new Date().toISOString(),
    };
  }
}
