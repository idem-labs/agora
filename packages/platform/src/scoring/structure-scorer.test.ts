import { describe, it, expect } from "vitest";
import { StructureScorer } from "./structure-scorer.js";
import {
  makeFullDataset,
  makeMinimalDataset,
  makeLowQualityDataset,
} from "../__fixtures__/sample-datasets.js";
import type { Resource } from "@agora/sdk";

const scorer = new StructureScorer();

function resource(format: string): Resource {
  return {
    id: `r-${format}`,
    datasetId: "test:ds1",
    url: `https://example.com/data.${format.toLowerCase()}`,
    format,
  };
}

describe("StructureScorer", () => {
  it("scores CSV resource at 0.95", async () => {
    const dataset = makeMinimalDataset({ resources: [resource("CSV")] });
    const result = await scorer.score(dataset);
    expect(result.dimension).toBe("structure");
    expect(result.score).toBe(0.95);
  });

  it("scores PDF resource at 0.15", async () => {
    const result = await scorer.score(makeLowQualityDataset());
    expect(result.score).toBe(0.15);
  });

  it("uses max score across mixed resources (CSV+PDF = 0.95)", async () => {
    const dataset = makeFullDataset();
    // Full dataset has CSV, JSON, PDF → max is CSV = 0.95
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.95);
  });

  it("scores zero resources as 0", async () => {
    const result = await scorer.score(makeMinimalDataset());
    expect(result.score).toBe(0);
    expect(result.evidence!.resourceCount).toBe(0);
  });

  it("handles case-insensitive formats", async () => {
    const dataset = makeMinimalDataset({ resources: [resource("csv")] });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.95);
  });

  it("scores unknown format at 0.10", async () => {
    const dataset = makeMinimalDataset({ resources: [resource("DOCX")] });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.10);
  });

  it("includes format distribution in evidence", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("CSV"), resource("CSV"), resource("JSON")],
    });
    const result = await scorer.score(dataset);
    const ev = result.evidence!;
    expect(ev.formatDistribution).toEqual({ CSV: 2, JSON: 1 });
    expect(ev.bestFormat).toBe("CSV");
    expect(ev.bestFormatScore).toBe(0.95);
  });

  it("handles empty format string as unknown", async () => {
    const dataset = makeMinimalDataset({
      resources: [{ id: "r1", datasetId: "test:ds1", url: "https://example.com/data", format: "" }],
    });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.10);
  });
});
