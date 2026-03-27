import type { DatasetRecord, DimensionScore } from "@agora/sdk";
import type { Scorer } from "./scorer.js";

/** Field weights for completeness scoring (sum = 1.0). */
const FIELD_WEIGHTS: Record<string, number> = {
  title: 0.15,
  description: 0.25,
  organization: 0.15,
  tags: 0.15,
  license: 0.10,
  resources: 0.10,
  modifiedAt: 0.05,
  createdAt: 0.05,
};

/** Minimum description length for full weight (shorter = half). */
const MIN_DESCRIPTION_LENGTH = 20;

export class CompletenessScorer implements Scorer {
  readonly dimension = "completeness" as const;

  async score(dataset: DatasetRecord): Promise<DimensionScore> {
    const present: string[] = [];
    const missing: string[] = [];
    let total = 0;

    // title — always technically present, but check non-empty
    if (dataset.title && dataset.title.trim().length > 0) {
      total += FIELD_WEIGHTS.title;
      present.push("title");
    } else {
      missing.push("title");
    }

    // description — half weight if too short
    if (dataset.description && dataset.description.trim().length > 0) {
      if (dataset.description.trim().length >= MIN_DESCRIPTION_LENGTH) {
        total += FIELD_WEIGHTS.description;
      } else {
        total += FIELD_WEIGHTS.description / 2;
      }
      present.push("description");
    } else {
      missing.push("description");
    }

    // organization
    if (dataset.organization && dataset.organization.trim().length > 0) {
      total += FIELD_WEIGHTS.organization;
      present.push("organization");
    } else {
      missing.push("organization");
    }

    // tags (non-empty array)
    if (dataset.tags && dataset.tags.length > 0) {
      total += FIELD_WEIGHTS.tags;
      present.push("tags");
    } else {
      missing.push("tags");
    }

    // license
    if (dataset.license && dataset.license.trim().length > 0) {
      total += FIELD_WEIGHTS.license;
      present.push("license");
    } else {
      missing.push("license");
    }

    // resources (at least one)
    if (dataset.resources && dataset.resources.length > 0) {
      total += FIELD_WEIGHTS.resources;
      present.push("resources");
    } else {
      missing.push("resources");
    }

    // modifiedAt
    if (dataset.modifiedAt) {
      total += FIELD_WEIGHTS.modifiedAt;
      present.push("modifiedAt");
    } else {
      missing.push("modifiedAt");
    }

    // createdAt
    if (dataset.createdAt) {
      total += FIELD_WEIGHTS.createdAt;
      present.push("createdAt");
    } else {
      missing.push("createdAt");
    }

    return {
      dimension: "completeness",
      score: Math.round(total * 1000) / 1000,
      evidence: {
        fieldsPresent: present,
        fieldsMissing: missing,
        descriptionLength: dataset.description?.trim().length ?? null,
        tagCount: dataset.tags?.length ?? 0,
        resourceCount: dataset.resources?.length ?? 0,
      },
      calculatedAt: new Date().toISOString(),
    };
  }
}
