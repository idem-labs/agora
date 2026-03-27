import { describe, it, expect } from "vitest";
import {
  getCatalogEntry,
  getAllCatalogEntries,
  getPreset,
  getAllPresets,
  resolveActiveCatalogs,
} from "./index.js";

describe("Catalog Directory", () => {
  it("getAllCatalogEntries returns all built-in catalogs", () => {
    const entries = getAllCatalogEntries();
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries.every((e) => e.id && e.url && e.protocol)).toBe(true);
  });

  it("getCatalogEntry returns a known catalog", () => {
    const entry = getCatalogEntry("datos-gob-ar");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("datos.gob.ar");
    expect(entry!.protocol).toBe("ckan");
    expect(entry!.language).toBe("es");
    expect(entry!.country).toBe("AR");
  });

  it("getCatalogEntry returns undefined for unknown id", () => {
    expect(getCatalogEntry("nonexistent")).toBeUndefined();
  });

  it("includes the expected catalogs", () => {
    const ids = getAllCatalogEntries().map((e) => e.id);
    expect(ids).toContain("datos-gob-ar");
    expect(ids).toContain("datos-gob-cl");
    expect(ids).toContain("catalogodatos-gub-uy");
    expect(ids).toContain("datos-gob-mx");
    expect(ids).toContain("catalog-data-gov");
    expect(ids).toContain("data-gov-uk");
    expect(ids).toContain("open-canada-ca");
  });

  it("each catalog entry has required fields", () => {
    for (const entry of getAllCatalogEntries()) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(["ckan", "socrata", "dcat"]).toContain(entry.protocol);
      expect(entry.language).toBeTruthy();
      expect(entry.country).toBeTruthy();
      expect(Array.isArray(entry.tags)).toBe(true);
    }
  });
});

describe("Presets", () => {
  it("getAllPresets returns all built-in presets", () => {
    const presets = getAllPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);
  });

  it("getPreset returns a known preset", () => {
    const preset = getPreset("latam");
    expect(preset).toBeDefined();
    expect(preset!.catalogIds).toContain("datos-gob-ar");
    expect(preset!.catalogIds).toContain("datos-gob-cl");
    expect(preset!.catalogIds).toContain("datos-gob-mx");
    expect(preset!.catalogIds).toContain("catalogodatos-gub-uy");
  });

  it("getPreset returns undefined for unknown preset", () => {
    expect(getPreset("nonexistent")).toBeUndefined();
  });

  it("'all' preset includes every catalog", () => {
    const allPreset = getPreset("all");
    const allEntries = getAllCatalogEntries();
    expect(allPreset).toBeDefined();
    expect(allPreset!.catalogIds.length).toBe(allEntries.length);
    for (const entry of allEntries) {
      expect(allPreset!.catalogIds).toContain(entry.id);
    }
  });

  it("preset catalogIds reference valid catalog entries", () => {
    for (const preset of getAllPresets()) {
      for (const catId of preset.catalogIds) {
        expect(getCatalogEntry(catId)).toBeDefined();
      }
    }
  });
});

describe("resolveActiveCatalogs", () => {
  it("defaults to datos-gob-ar when nothing specified", () => {
    const result = resolveActiveCatalogs([], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("datos-gob-ar");
  });

  it("resolves a single preset", () => {
    const result = resolveActiveCatalogs(["argentina"], []);
    expect(result).toHaveLength(9);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("datos-gob-ar");
    expect(ids).toContain("catalogo-datos-gba-ar");
    expect(ids).toContain("datosabiertos-mendoza-ar");
  });

  it("resolves a multi-catalog preset", () => {
    const result = resolveActiveCatalogs(["latam"], []);
    expect(result.length).toBe(15);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("datos-gob-ar");
    expect(ids).toContain("datos-gob-cl");
    expect(ids).toContain("datos-gov-co");
  });

  it("resolves explicit catalog IDs", () => {
    const result = resolveActiveCatalogs([], ["data-gov-uk", "open-canada-ca"]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["data-gov-uk", "open-canada-ca"]);
  });

  it("combines presets and explicit IDs (deduplicates)", () => {
    const result = resolveActiveCatalogs(["argentina"], ["datos-gob-ar", "datos-gob-cl"]);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("datos-gob-ar");
    expect(ids).toContain("datos-gob-cl");
    // datos-gob-ar should appear only once (from preset + explicit)
    expect(ids.filter((id) => id === "datos-gob-ar")).toHaveLength(1);
  });

  it("throws for unknown preset", () => {
    expect(() => resolveActiveCatalogs(["fake-preset"], [])).toThrow(
      /Unknown preset.*fake-preset/,
    );
  });

  it("throws for unknown catalog ID", () => {
    expect(() => resolveActiveCatalogs([], ["fake-catalog"])).toThrow(
      /Unknown catalog.*fake-catalog/,
    );
  });

  it("resolves multiple presets", () => {
    const result = resolveActiveCatalogs(["argentina", "english"], []);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("datos-gob-ar");
    expect(ids).toContain("catalog-data-gov");
    expect(ids).toContain("data-gov-uk");
    expect(ids).toContain("open-canada-ca");
  });
});
