import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SocrataAdapter } from "./socrata-adapter.js";
import type { Logger } from "../../logger.js";
import datasetsFixture from "../../__fixtures__/socrata-datasets.json";
import singleFixture from "../../__fixtures__/socrata-single-dataset.json";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

describe("SocrataAdapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes catalog metadata", () => {
    const adapter = new SocrataAdapter(
      {
        catalogId: "data-cityofnewyork-us",
        name: "NYC Open Data",
        domain: "data.cityofnewyork.us",
        country: "US",
      },
      mockLogger,
    );

    expect(adapter.catalog.id).toBe("data-cityofnewyork-us");
    expect(adapter.catalog.name).toBe("NYC Open Data");
    expect(adapter.catalog.type).toBe("socrata");
    expect(adapter.catalog.url).toBe("https://data.cityofnewyork.us");
    expect(adapter.catalog.country).toBe("US");
    expect(adapter.catalog.enabled).toBe(true);
  });

  it("listDatasets yields mapped records, skipping non-datasets", async () => {
    globalThis.fetch = mockFetch(datasetsFixture) as typeof fetch;

    const adapter = new SocrataAdapter(
      {
        catalogId: "data-cityofnewyork-us",
        name: "NYC Open Data",
        domain: "data.cityofnewyork.us",
      },
      mockLogger,
    );

    const records = [];
    for await (const record of adapter.listDatasets()) {
      records.push(record);
    }

    // Fixture has 3 results, but one is type "map"
    expect(records).toHaveLength(2);
    expect(records[0].externalId).toBe("8wbx-tsch");
    expect(records[1].externalId).toBe("h9gi-nx95");
  });

  it("getDataset returns a mapped record", async () => {
    globalThis.fetch = mockFetch(singleFixture) as typeof fetch;

    const adapter = new SocrataAdapter(
      {
        catalogId: "data-cityofnewyork-us",
        name: "NYC Open Data",
        domain: "data.cityofnewyork.us",
      },
      mockLogger,
    );

    const record = await adapter.getDataset("8wbx-tsch");

    expect(record).not.toBeNull();
    expect(record!.title).toBe("For Hire Vehicles (FHV) - Active");
    expect(record!.catalogId).toBe("data-cityofnewyork-us");
  });

  it("getDataset returns null on error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error")) as typeof fetch;

    const adapter = new SocrataAdapter(
      {
        catalogId: "data-cityofnewyork-us",
        name: "NYC Open Data",
        domain: "data.cityofnewyork.us",
      },
      mockLogger,
    );

    const record = await adapter.getDataset("nonexistent");
    expect(record).toBeNull();
  });

  it("getDataset returns null when not found", async () => {
    globalThis.fetch = mockFetch({
      results: [],
      resultSetSize: 0,
    }) as typeof fetch;

    const adapter = new SocrataAdapter(
      {
        catalogId: "data-cityofnewyork-us",
        name: "NYC Open Data",
        domain: "data.cityofnewyork.us",
      },
      mockLogger,
    );

    const record = await adapter.getDataset("nonexistent");
    expect(record).toBeNull();
  });
});
