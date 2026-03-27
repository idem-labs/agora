import { describe, it, expect } from "vitest";
import { reciprocalRankFusion, type RankedItem } from "./rrf.js";

describe("reciprocalRankFusion", () => {
  it("returns empty array when both inputs are empty", () => {
    const result = reciprocalRankFusion([], []);
    expect(result).toEqual([]);
  });

  it("returns lexical-only scores when semantic is empty", () => {
    const lexical: RankedItem[] = [
      { id: "a", score: 10 },
      { id: "b", score: 5 },
    ];
    const result = reciprocalRankFusion([], lexical);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
    // Only lexical weight contributes: 0.4/(60+1) > 0.4/(60+2)
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("returns semantic-only scores when lexical is empty", () => {
    const semantic: RankedItem[] = [
      { id: "x", score: 0.9 },
      { id: "y", score: 0.8 },
    ];
    const result = reciprocalRankFusion(semantic, []);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("x");
    expect(result[1].id).toBe("y");
    // Only semantic weight: 0.6/(60+1) > 0.6/(60+2)
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("fuses overlapping results with boosted score", () => {
    const semantic: RankedItem[] = [
      { id: "a", score: 0.95 },
      { id: "b", score: 0.80 },
    ];
    const lexical: RankedItem[] = [
      { id: "a", score: 12 },
      { id: "c", score: 8 },
    ];

    const result = reciprocalRankFusion(semantic, lexical);

    // "a" appears in both → gets both contributions
    expect(result[0].id).toBe("a");
    // "a" gets: 0.6/(60+1) + 0.4/(60+1) = 1.0/61
    const expectedA = 0.6 / 61 + 0.4 / 61;
    expect(result[0].score).toBeCloseTo(expectedA, 6);
  });

  it("items only in one list get single contribution", () => {
    const semantic: RankedItem[] = [{ id: "s", score: 0.9 }];
    const lexical: RankedItem[] = [{ id: "l", score: 10 }];

    const result = reciprocalRankFusion(semantic, lexical);

    expect(result).toHaveLength(2);
    // "s" gets: 0.6/(60+1) = 0.6/61
    const sItem = result.find((r) => r.id === "s")!;
    expect(sItem.score).toBeCloseTo(0.6 / 61, 6);
    // "l" gets: 0.4/(60+1) = 0.4/61
    const lItem = result.find((r) => r.id === "l")!;
    expect(lItem.score).toBeCloseTo(0.4 / 61, 6);
  });

  it("respects rank position (later items get lower score)", () => {
    const semantic: RankedItem[] = [
      { id: "first", score: 0.9 },
      { id: "second", score: 0.8 },
      { id: "third", score: 0.7 },
    ];
    const result = reciprocalRankFusion(semantic, []);

    // Rank 1: 0.6/61, Rank 2: 0.6/62, Rank 3: 0.6/63
    expect(result[0].score).toBeCloseTo(0.6 / 61, 6);
    expect(result[1].score).toBeCloseTo(0.6 / 62, 6);
    expect(result[2].score).toBeCloseTo(0.6 / 63, 6);
  });

  it("uses custom weights and k", () => {
    const semantic: RankedItem[] = [{ id: "a", score: 1 }];
    const lexical: RankedItem[] = [{ id: "a", score: 1 }];

    const result = reciprocalRankFusion(semantic, lexical, {
      semanticWeight: 0.5,
      lexicalWeight: 0.5,
      k: 10,
    });

    // Both at rank 1: 0.5/(10+1) + 0.5/(10+1) = 1.0/11
    expect(result[0].score).toBeCloseTo(1.0 / 11, 6);
  });

  it("result is sorted descending by score", () => {
    const semantic: RankedItem[] = [
      { id: "c", score: 0.7 },
      { id: "a", score: 0.6 },
    ];
    const lexical: RankedItem[] = [
      { id: "a", score: 10 },
      { id: "b", score: 5 },
    ];

    const result = reciprocalRankFusion(semantic, lexical);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("handles large lists without issues", () => {
    const semantic = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      score: 1 - i * 0.01,
    }));
    const lexical = Array.from({ length: 100 }, (_, i) => ({
      id: `l${i}`,
      score: 100 - i,
    }));

    const result = reciprocalRankFusion(semantic, lexical);
    expect(result).toHaveLength(200); // no overlap
    // All scores positive
    for (const item of result) {
      expect(item.score).toBeGreaterThan(0);
    }
  });
});
