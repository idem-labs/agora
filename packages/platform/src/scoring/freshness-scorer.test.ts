import { describe, it, expect } from "vitest";
import { FreshnessScorer } from "./freshness-scorer.js";
import { makeFullDataset, makeMinimalDataset } from "../__fixtures__/sample-datasets.js";

const scorer = new FreshnessScorer(180);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("FreshnessScorer", () => {
  it("scores recently updated dataset close to 1.0", async () => {
    const dataset = makeFullDataset({ modifiedAt: new Date().toISOString() });
    const result = await scorer.score(dataset);
    expect(result.dimension).toBe("freshness");
    expect(result.score).toBeGreaterThanOrEqual(0.99);
  });

  it("scores 180-day-old dataset at ~0.5", async () => {
    const dataset = makeFullDataset({ modifiedAt: daysAgo(180) });
    const result = await scorer.score(dataset);
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  it("scores 365-day-old dataset at ~0.25", async () => {
    const dataset = makeFullDataset({ modifiedAt: daysAgo(365) });
    const result = await scorer.score(dataset);
    expect(result.score).toBeCloseTo(0.25, 1);
  });

  it("scores dataset with no modifiedAt as 0", async () => {
    const dataset = makeMinimalDataset({ modifiedAt: undefined });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0);
    expect(result.evidence!.modifiedAt).toBeNull();
  });

  it("clamps future dates to 1.0", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const dataset = makeFullDataset({ modifiedAt: future.toISOString() });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(1);
  });

  it("respects custom half-life", async () => {
    const shortScorer = new FreshnessScorer(30);
    const dataset = makeFullDataset({ modifiedAt: daysAgo(30) });
    const result = await shortScorer.score(dataset);
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  it("includes evidence fields", async () => {
    const dataset = makeFullDataset({ modifiedAt: daysAgo(90) });
    const result = await scorer.score(dataset);
    const ev = result.evidence!;
    expect(ev.modifiedAt).toBeTruthy();
    expect(ev.daysSinceModified).toBeCloseTo(90, 0);
    expect(ev.halfLifeDays).toBe(180);
  });

  it("very old datasets score near zero", async () => {
    const dataset = makeFullDataset({ modifiedAt: daysAgo(730) });
    const result = await scorer.score(dataset);
    expect(result.score).toBeLessThan(0.1);
  });
});
