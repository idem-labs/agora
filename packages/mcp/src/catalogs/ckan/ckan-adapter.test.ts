import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CkanAdapter } from "./ckan-adapter.js";
import type { Logger } from "../../logger.js";
import packagesFixture from "../../__fixtures__/ckan-packages.json";
import singleFixture from "../../__fixtures__/ckan-single-package.json";

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

describe("CkanAdapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes catalog metadata", () => {
    const adapter = new CkanAdapter(
      {
        catalogId: "datos-gob-ar",
        name: "Datos Argentina",
        baseUrl: "https://datos.gob.ar",
        country: "AR",
      },
      mockLogger,
    );

    expect(adapter.catalog.id).toBe("datos-gob-ar");
    expect(adapter.catalog.name).toBe("Datos Argentina");
    expect(adapter.catalog.type).toBe("ckan");
    expect(adapter.catalog.country).toBe("AR");
    expect(adapter.catalog.enabled).toBe(true);
  });

  it("listDatasets yields mapped records, skipping deleted", async () => {
    globalThis.fetch = mockFetch(packagesFixture) as typeof fetch;

    const adapter = new CkanAdapter(
      {
        catalogId: "datos-gob-ar",
        name: "Datos Argentina",
        baseUrl: "https://datos.gob.ar",
      },
      mockLogger,
    );

    const records = [];
    for await (const record of adapter.listDatasets()) {
      records.push(record);
    }

    // Fixture has 3 packages, but one has state "deleted"
    expect(records).toHaveLength(2);
    expect(records[0].externalId).toBe("presupuesto-nacional-2024");
    expect(records[1].externalId).toBe("censo-2022-resultados");
  });

  it("getDataset returns a mapped record", async () => {
    globalThis.fetch = mockFetch(singleFixture) as typeof fetch;

    const adapter = new CkanAdapter(
      {
        catalogId: "datos-gob-ar",
        name: "Datos Argentina",
        baseUrl: "https://datos.gob.ar",
      },
      mockLogger,
    );

    const record = await adapter.getDataset("presupuesto-nacional-2024");

    expect(record).not.toBeNull();
    expect(record!.title).toBe("Presupuesto Nacional 2024");
    expect(record!.catalogId).toBe("datos-gob-ar");
  });

  it("getDataset returns null on error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("Network error"),
    ) as typeof fetch;

    const adapter = new CkanAdapter(
      {
        catalogId: "datos-gob-ar",
        name: "Datos Argentina",
        baseUrl: "https://datos.gob.ar",
      },
      mockLogger,
    );

    const record = await adapter.getDataset("nonexistent");
    expect(record).toBeNull();
  });
});
