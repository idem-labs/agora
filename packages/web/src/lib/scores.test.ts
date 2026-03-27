import { describe, it, expect } from "vitest";
import {
  scoreLevel,
  scoreColor,
  scoreBg,
  scoreBgLight,
  scoreTextColor,
  scoreLabel,
  pct,
} from "./scores";

describe("scoreLevel", () => {
  it("returns correct levels for threshold boundaries", () => {
    expect(scoreLevel(1.0)).toBe("excellent");
    expect(scoreLevel(0.8)).toBe("excellent");
    expect(scoreLevel(0.79)).toBe("good");
    expect(scoreLevel(0.6)).toBe("good");
    expect(scoreLevel(0.59)).toBe("fair");
    expect(scoreLevel(0.4)).toBe("fair");
    expect(scoreLevel(0.39)).toBe("poor");
    expect(scoreLevel(0.2)).toBe("poor");
    expect(scoreLevel(0.19)).toBe("critical");
    expect(scoreLevel(0)).toBe("critical");
  });
});

describe("scoreColor", () => {
  it("returns hex color strings", () => {
    expect(scoreColor(0.9)).toBe("#10b981");
    expect(scoreColor(0.7)).toBe("#3b82f6");
    expect(scoreColor(0.5)).toBe("#f59e0b");
    expect(scoreColor(0.3)).toBe("#f97316");
    expect(scoreColor(0.1)).toBe("#ef4444");
  });
});

describe("scoreBg / scoreBgLight / scoreTextColor", () => {
  it("returns Tailwind classes", () => {
    expect(scoreBg(0.9)).toBe("bg-emerald-500");
    expect(scoreBgLight(0.9)).toBe("bg-emerald-50");
    expect(scoreTextColor(0.9)).toBe("text-emerald-700");
  });
});

describe("scoreLabel", () => {
  it("returns human-readable labels", () => {
    expect(scoreLabel(0.9)).toBe("Excellent");
    expect(scoreLabel(0.1)).toBe("Critical");
  });
});

describe("pct", () => {
  it("formats as percentage string", () => {
    expect(pct(0.634)).toBe("63%");
    expect(pct(1)).toBe("100%");
    expect(pct(0)).toBe("0%");
  });
});
