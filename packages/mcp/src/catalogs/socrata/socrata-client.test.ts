import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SocrataClient } from "./socrata-client.js";
import type { Logger } from "../../logger.js";
import datasetsFixture from "../../__fixtures__/socrata-datasets.json";
import singleFixture from "../../__fixtures__/socrata-single-dataset.json";

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

describe("SocrataClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("searchDatasets returns results from catalog/v1", async () => {
    globalThis.fetch = mockFetch(datasetsFixture) as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    const result = await client.searchDatasets(0, 10);

    expect(result.resultSetSize).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].resource.id).toBe("8wbx-tsch");
  });

  it("searchDatasets calls correct URL with offset and limit", async () => {
    const fetchMock = mockFetch(datasetsFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    await client.searchDatasets(200, 50);

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe(
      "https://data.cityofnewyork.us/api/catalog/v1?only=datasets&domains=data.cityofnewyork.us&limit=50&offset=200",
    );
  });

  it("strips trailing slash from domain", async () => {
    const fetchMock = mockFetch(datasetsFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us///" },
      mockLogger,
    );

    await client.searchDatasets(0);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(
      calledUrl.startsWith("https://data.cityofnewyork.us/api/catalog/v1"),
    ).toBe(true);
  });

  it("getDataset returns a single result by ID", async () => {
    globalThis.fetch = mockFetch(singleFixture) as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    const result = await client.getDataset("8wbx-tsch");

    expect(result).not.toBeNull();
    expect(result!.resource.name).toBe("For Hire Vehicles (FHV) - Active");
  });

  it("getDataset returns null when not found", async () => {
    globalThis.fetch = mockFetch({
      results: [],
      resultSetSize: 0,
    }) as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    const result = await client.getDataset("nonexistent");
    expect(result).toBeNull();
  });

  it("throws on HTTP error", async () => {
    globalThis.fetch = mockFetch(null, 500) as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    await expect(client.searchDatasets(0)).rejects.toThrow(
      "Socrata HTTP 500",
    );
  });

  it("listAllDatasets paginates through all results", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  resource: { id: "a1", name: "D1", type: "dataset" },
                  classification: {},
                  metadata: { domain: "example.com" },
                },
                {
                  resource: { id: "a2", name: "D2", type: "dataset" },
                  classification: {},
                  metadata: { domain: "example.com" },
                },
                {
                  resource: { id: "a3", name: "D3", type: "dataset" },
                  classification: {},
                  metadata: { domain: "example.com" },
                },
              ],
              resultSetSize: 5,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                resource: { id: "a4", name: "D4", type: "dataset" },
                classification: {},
                metadata: { domain: "example.com" },
              },
              {
                resource: { id: "a5", name: "D5", type: "dataset" },
                classification: {},
                metadata: { domain: "example.com" },
              },
            ],
            resultSetSize: 5,
          }),
      });
    }) as typeof fetch;

    const client = new SocrataClient(
      { domain: "example.com", pageSize: 3 },
      mockLogger,
    );

    const allPages: unknown[][] = [];
    for await (const page of client.listAllDatasets()) {
      allPages.push(page);
    }

    expect(allPages).toHaveLength(2);
    expect(allPages[0]).toHaveLength(3);
    expect(allPages[1]).toHaveLength(2);
  });

  it("sends User-Agent header", async () => {
    const fetchMock = mockFetch(datasetsFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SocrataClient(
      { domain: "data.cityofnewyork.us" },
      mockLogger,
    );

    await client.searchDatasets(0);

    const options = fetchMock.mock.calls[0][1];
    expect(options.headers["User-Agent"]).toBe("agora-mcp/0.1");
  });
});
