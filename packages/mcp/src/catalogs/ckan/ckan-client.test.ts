import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CkanClient } from "./ckan-client.js";
import type { Logger } from "../../logger.js";
import packagesFixture from "../../__fixtures__/ckan-packages.json";
import singleFixture from "../../__fixtures__/ckan-single-package.json";

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

describe("CkanClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("searchPackages returns results from package_search", async () => {
    globalThis.fetch = mockFetch(packagesFixture) as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar" },
      mockLogger,
    );

    const result = await client.searchPackages(0, 10);

    expect(result.count).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].name).toBe("presupuesto-nacional-2024");
  });

  it("searchPackages calls correct URL with offset and rows", async () => {
    const fetchMock = mockFetch(packagesFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar/" },
      mockLogger,
    );

    await client.searchPackages(100, 50);

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe(
      "https://datos.gob.ar/api/3/action/package_search?rows=50&start=100",
    );
  });

  it("strips trailing slash from base URL", async () => {
    const fetchMock = mockFetch(packagesFixture);
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar///" },
      mockLogger,
    );

    await client.searchPackages(0);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("https://datos.gob.ar/api/")).toBe(true);
  });

  it("getPackage fetches a single package", async () => {
    globalThis.fetch = mockFetch(singleFixture) as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar" },
      mockLogger,
    );

    const pkg = await client.getPackage("presupuesto-nacional-2024");
    expect(pkg.name).toBe("presupuesto-nacional-2024");
  });

  it("throws on HTTP error", async () => {
    globalThis.fetch = mockFetch(null, 500) as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar" },
      mockLogger,
    );

    await expect(client.searchPackages(0)).rejects.toThrow("CKAN HTTP 500");
  });

  it("throws on CKAN API error", async () => {
    globalThis.fetch = mockFetch({
      success: false,
      error: { message: "Not found", __type: "Not Found Error" },
    }) as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar" },
      mockLogger,
    );

    await expect(client.searchPackages(0)).rejects.toThrow(
      "CKAN API error: Not found",
    );
  });

  it("listAllPackages paginates through all results", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              result: {
                count: 5,
                results: [
                  { id: "1", name: "d1", title: "D1" },
                  { id: "2", name: "d2", title: "D2" },
                  { id: "3", name: "d3", title: "D3" },
                ],
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: {
              count: 5,
              results: [
                { id: "4", name: "d4", title: "D4" },
                { id: "5", name: "d5", title: "D5" },
              ],
            },
          }),
      });
    }) as typeof fetch;

    const client = new CkanClient(
      { baseUrl: "https://datos.gob.ar", pageSize: 3 },
      mockLogger,
    );

    const allPages: unknown[][] = [];
    for await (const page of client.listAllPackages()) {
      allPages.push(page);
    }

    expect(allPages).toHaveLength(2);
    expect(allPages[0]).toHaveLength(3);
    expect(allPages[1]).toHaveLength(2);
  });
});
