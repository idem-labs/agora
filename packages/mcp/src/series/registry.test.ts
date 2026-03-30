import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeSeriesRegistry } from "./registry.js";
import type { Logger } from "../logger.js";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("TimeSeriesRegistry", () => {
  // Suppress fetch calls from adapter construction
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers argentina adapter by default", () => {
    const registry = new TimeSeriesRegistry(mockLogger);
    const adapter = registry.get("argentina");

    expect(adapter).toBeDefined();
    expect(adapter!.source.id).toBe("argentina");
  });

  it("returns undefined for unknown source", () => {
    const registry = new TimeSeriesRegistry(mockLogger);
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists available sources", () => {
    const registry = new TimeSeriesRegistry(mockLogger);
    const sources = registry.listSources();

    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe("argentina");
    expect(sources[0].name).toContain("Argentina");
  });

  it("returns source IDs", () => {
    const registry = new TimeSeriesRegistry(mockLogger);
    expect(registry.sourceIds()).toEqual(["argentina"]);
  });
});
