import type { DatasetRecord, DimensionScore } from "@agora/sdk";
import type { Scorer } from "./scorer.js";

/** Format → score mapping. Higher = more analyzable by automated tools. */
const FORMAT_SCORES: Record<string, number> = {
  csv: 0.95,
  tsv: 0.90,
  parquet: 0.95,
  json: 0.85,
  geojson: 0.80,
  xml: 0.70,
  xls: 0.65,
  xlsx: 0.65,
  ods: 0.60,
  shp: 0.55,
  kml: 0.55,
  zip: 0.40,
  html: 0.30,
  pdf: 0.15,
};

const DEFAULT_SCORE = 0.10;

function formatScore(format: string): number {
  const key = format.toLowerCase().trim();
  return FORMAT_SCORES[key] ?? DEFAULT_SCORE;
}

export class StructureScorer implements Scorer {
  readonly dimension = "structure" as const;

  async score(dataset: DatasetRecord): Promise<DimensionScore> {
    const resources = dataset.resources ?? [];

    if (resources.length === 0) {
      return {
        dimension: "structure",
        score: 0,
        evidence: {
          formats: [],
          bestFormat: null,
          bestFormatScore: 0,
          resourceCount: 0,
          formatDistribution: {},
        },
        calculatedAt: new Date().toISOString(),
      };
    }

    // Count format distribution
    const distribution: Record<string, number> = {};
    for (const r of resources) {
      const fmt = (r.format || "unknown").toUpperCase();
      distribution[fmt] = (distribution[fmt] ?? 0) + 1;
    }

    // Best format wins (max score across resources)
    let bestScore = 0;
    let bestFormat = "unknown";
    for (const r of resources) {
      const fmt = r.format || "unknown";
      const s = formatScore(fmt);
      if (s > bestScore) {
        bestScore = s;
        bestFormat = fmt.toUpperCase();
      }
    }

    return {
      dimension: "structure",
      score: bestScore,
      evidence: {
        formats: Object.keys(distribution),
        bestFormat,
        bestFormatScore: bestScore,
        resourceCount: resources.length,
        formatDistribution: distribution,
      },
      calculatedAt: new Date().toISOString(),
    };
  }
}
