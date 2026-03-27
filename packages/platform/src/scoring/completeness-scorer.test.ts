import { describe, it, expect } from "vitest";
import { CompletenessScorer } from "./completeness-scorer.js";
import {
  makeFullDataset,
  makeMinimalDataset,
  makeLowQualityDataset,
} from "../__fixtures__/sample-datasets.js";

const scorer = new CompletenessScorer();

describe("CompletenessScorer", () => {
  it("scores a full dataset close to 1.0", async () => {
    const result = await scorer.score(makeFullDataset());
    expect(result.dimension).toBe("completeness");
    expect(result.score).toBe(1);
    expect(result.evidence!.fieldsMissing).toHaveLength(0);
  });

  it("scores a minimal dataset low", async () => {
    const result = await scorer.score(makeMinimalDataset());
    // Only title is present (and non-empty) = 0.15
    expect(result.score).toBe(0.15);
    expect(result.evidence!.fieldsPresent).toEqual(["title"]);
  });

  it("gives half weight for short descriptions", async () => {
    const dataset = makeFullDataset({ description: "Short." });
    const result = await scorer.score(dataset);
    // Full dataset minus half of description weight (0.25 / 2 = 0.125 lost)
    expect(result.score).toBeCloseTo(1.0 - 0.125, 3);
  });

  it("scores empty tags as missing", async () => {
    const dataset = makeFullDataset({ tags: [] });
    const result = await scorer.score(dataset);
    expect(result.evidence!.fieldsMissing).toContain("tags");
    expect(result.score).toBeCloseTo(1.0 - 0.15, 3);
  });

  it("scores empty resources as missing", async () => {
    const dataset = makeFullDataset({ resources: [] });
    const result = await scorer.score(dataset);
    expect(result.evidence!.fieldsMissing).toContain("resources");
    expect(result.score).toBeCloseTo(1.0 - 0.10, 3);
  });

  it("scores missing license", async () => {
    const dataset = makeFullDataset({ license: undefined });
    const result = await scorer.score(dataset);
    expect(result.evidence!.fieldsMissing).toContain("license");
    expect(result.score).toBeCloseTo(1.0 - 0.10, 3);
  });

  it("includes correct evidence fields", async () => {
    const result = await scorer.score(makeLowQualityDataset());
    const ev = result.evidence!;
    expect(ev).toHaveProperty("fieldsPresent");
    expect(ev).toHaveProperty("fieldsMissing");
    expect(ev).toHaveProperty("descriptionLength");
    expect(ev).toHaveProperty("tagCount");
    expect(ev).toHaveProperty("resourceCount");
  });

  it("handles missing timestamps", async () => {
    const dataset = makeFullDataset({ modifiedAt: undefined, createdAt: undefined });
    const result = await scorer.score(dataset);
    expect(result.evidence!.fieldsMissing).toContain("modifiedAt");
    expect(result.evidence!.fieldsMissing).toContain("createdAt");
    expect(result.score).toBeCloseTo(1.0 - 0.10, 3);
  });
});
