import { describe, it, expect, vi } from "vitest";
import { CatalogRegistry } from "./catalog-registry.js";
import type { CatalogEntry } from "./directory/types.js";
import type { Logger } from "../logger.js";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const defaultEntry: CatalogEntry = {
  id: "datos-gob-ar",
  name: "datos.gob.ar",
  url: "https://datos.gob.ar",
  protocol: "ckan",
  language: "es",
  country: "AR",
  tags: ["argentina", "nacional", "gobierno"],
};

describe("CatalogRegistry", () => {
  it("creates adapter from a CKAN catalog entry", () => {
    const registry = new CatalogRegistry([defaultEntry], mockLogger);
    const catalogs = registry.list();

    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].id).toBe("datos-gob-ar");
    expect(catalogs[0].name).toBe("datos.gob.ar");
    expect(catalogs[0].type).toBe("ckan");
    expect(catalogs[0].url).toBe("https://datos.gob.ar");
  });

  it("gets adapter by ID", () => {
    const registry = new CatalogRegistry([defaultEntry], mockLogger);
    const adapter = registry.get("datos-gob-ar");

    expect(adapter).toBeDefined();
    expect(adapter!.catalog.id).toBe("datos-gob-ar");
  });

  it("returns undefined for unknown catalog ID", () => {
    const registry = new CatalogRegistry([defaultEntry], mockLogger);
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("listAdapters returns adapter instances", () => {
    const registry = new CatalogRegistry([defaultEntry], mockLogger);
    const adapters = registry.listAdapters();

    expect(adapters).toHaveLength(1);
    expect(adapters[0].catalog.id).toBe("datos-gob-ar");
  });

  it("creates multiple adapters from multiple entries", () => {
    const entries: CatalogEntry[] = [
      defaultEntry,
      {
        id: "datos-gob-cl",
        name: "datos.gob.cl",
        url: "https://datos.gob.cl",
        protocol: "ckan",
        language: "es",
        country: "CL",
        tags: ["chile", "nacional"],
      },
    ];

    const registry = new CatalogRegistry(entries, mockLogger);
    const catalogs = registry.list();

    expect(catalogs).toHaveLength(2);
    expect(catalogs.map((c) => c.id)).toContain("datos-gob-ar");
    expect(catalogs.map((c) => c.id)).toContain("datos-gob-cl");
  });

  it("creates adapter from a Socrata catalog entry", () => {
    const entries: CatalogEntry[] = [
      defaultEntry,
      {
        id: "socrata-example",
        name: "Example Socrata",
        url: "https://example.com",
        protocol: "socrata",
        language: "en",
        country: "US",
        tags: ["test"],
      },
    ];

    const registry = new CatalogRegistry(entries, mockLogger);
    expect(registry.list()).toHaveLength(2);
    const socrata = registry.get("socrata-example");
    expect(socrata).toBeDefined();
    expect(socrata!.catalog.type).toBe("socrata");
  });

  it("skips unsupported protocols with a warning", () => {
    const entries: CatalogEntry[] = [
      defaultEntry,
      {
        id: "dcat-example",
        name: "Example DCAT",
        url: "https://example.com",
        protocol: "dcat",
        language: "en",
        country: "EU",
        tags: ["test"],
      },
    ];

    const registry = new CatalogRegistry(entries, mockLogger);
    expect(registry.list()).toHaveLength(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Unsupported protocol, skipping catalog",
      expect.objectContaining({ protocol: "dcat" }),
    );
  });

  it("handles empty entries array", () => {
    const registry = new CatalogRegistry([], mockLogger);
    expect(registry.list()).toHaveLength(0);
    expect(registry.listAdapters()).toHaveLength(0);
  });
});
