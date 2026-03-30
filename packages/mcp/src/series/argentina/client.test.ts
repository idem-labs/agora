import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArSeriesClient } from "./client.js";
import type { Logger } from "../../logger.js";
import searchFixture from "../../__fixtures__/ar-series-search.json";
import dataFixture from "../../__fixtures__/ar-series-data.json";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  });
}

describe("ArSeriesClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("search calls correct URL with query params", async () => {
    const fetchMock = mockFetch(searchFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ArSeriesClient({}, mockLogger);
    const result = await client.search("ipc", 5);

    expect(result.count).toBe(2);
    expect(result.data).toHaveLength(2);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/series/api/search/");
    expect(calledUrl).toContain("q=ipc");
    expect(calledUrl).toContain("limit=5");
    expect(calledUrl).toContain("format=json");
  });

  it("getData calls correct URL with series ID", async () => {
    const fetchMock = mockFetch(dataFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ArSeriesClient({}, mockLogger);
    const result = await client.getData(["103.1_I2N_2016_M_19"]);

    expect(result.data).toHaveLength(5);
    expect(result.count).toBe(100);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/series/api/series/");
    expect(calledUrl).toContain("ids=103.1_I2N_2016_M_19");
  });

  it("getData passes date range and collapse params", async () => {
    const fetchMock = mockFetch(dataFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ArSeriesClient({}, mockLogger);
    await client.getData(["103.1_I2N_2016_M_19"], {
      startDate: "2024-01-01",
      endDate: "2025-12-31",
      collapse: "quarter",
      aggregation: "avg",
      limit: 50,
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("start_date=2024-01-01");
    expect(calledUrl).toContain("end_date=2025-12-31");
    expect(calledUrl).toContain("collapse=quarter");
    expect(calledUrl).toContain("collapse_aggregation=avg");
    expect(calledUrl).toContain("limit=50");
  });

  it("retries on transient errors", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(searchFixture),
      });
    }) as typeof fetch;

    const client = new ArSeriesClient({ maxRetries: 3 }, mockLogger);
    const result = await client.search("test");

    expect(callCount).toBe(2);
    expect(result.count).toBe(2);
  });

  it("throws on HTTP error after retries exhausted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    }) as typeof fetch;

    const client = new ArSeriesClient({ maxRetries: 0 }, mockLogger);

    await expect(client.search("test")).rejects.toThrow("HTTP 500");
  });
});
