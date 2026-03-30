import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArgentinaSeriesAdapter } from "./adapter.js";
import type { Logger } from "../../logger.js";
import searchFixture from "../../__fixtures__/ar-series-search.json";
import dataFixture from "../../__fixtures__/ar-series-data.json";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  });
}

describe("ArgentinaSeriesAdapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has correct source metadata", () => {
    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);
    expect(adapter.source.id).toBe("argentina");
    expect(adapter.source.name).toContain("Argentina");
  });

  it("searchSeries maps results correctly", async () => {
    globalThis.fetch = mockFetch(searchFixture) as typeof fetch;

    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);
    const result = await adapter.searchSeries("ipc", 10);

    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe("103.1_I2N_2016_M_19");
    expect(result.results[0].frequency).toBe("monthly");
    expect(result.results[0].source).toContain("INDEC");
  });

  it("querySeries returns data points and metadata", async () => {
    globalThis.fetch = mockFetch(dataFixture) as typeof fetch;

    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);
    const result = await adapter.querySeries("103.1_I2N_2016_M_19", {
      startDate: "2025-01-01",
      limit: 5,
    });

    expect(result.series.id).toBe("103.1_I2N_2016_M_19");
    expect(result.series.units).toBe("Índice Dic-2016=100");
    expect(result.data).toHaveLength(5);
    expect(result.data[0]).toEqual({ date: "2025-01-01", value: 3820.5 });
    expect(result.data[3]).toEqual({ date: "2025-04-01", value: null }); // null value preserved
    expect(result.count).toBe(100);
  });

  it("querySeries passes collapse and aggregation", async () => {
    const fetchMock = mockFetch(dataFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);
    await adapter.querySeries("103.1_I2N_2016_M_19", {
      collapse: "quarter",
      aggregation: "avg",
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("collapse=quarter");
    expect(calledUrl).toContain("collapse_aggregation=avg");
  });

  it("getSeriesMetadata fetches with limit=1", async () => {
    const fetchMock = mockFetch(dataFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);
    const metadata = await adapter.getSeriesMetadata("103.1_I2N_2016_M_19");

    expect(metadata).not.toBeNull();
    expect(metadata!.id).toBe("103.1_I2N_2016_M_19");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("limit=1");
  });

  it("querySeries throws on unknown series", async () => {
    globalThis.fetch = mockFetch({
      data: [],
      count: 0,
      meta: [{ frequency: "month", start_date: "", end_date: "" }],
      params: { ids: "fake", limit: "1", format: "json" },
    }) as typeof fetch;

    const adapter = new ArgentinaSeriesAdapter(undefined, mockLogger);

    await expect(adapter.querySeries("fake")).rejects.toThrow(
      "No se encontró la serie: fake",
    );
  });
});
