import { describe, it, expect } from "vitest";
import { mapCkanPackage } from "./ckan-mapper.js";
import type { CkanPackage } from "./ckan-types.js";

const CATALOG_ID = "datos-gob-ar";

describe("mapCkanPackage", () => {
  const fullPackage: CkanPackage = {
    id: "abc-123",
    name: "presupuesto-nacional-2024",
    title: "Presupuesto Nacional 2024",
    notes: "Datos del presupuesto nacional.",
    organization: {
      id: "org-1",
      name: "ministerio-economia",
      title: "Ministerio de Economía",
    },
    tags: [
      { id: "t1", name: "presupuesto", display_name: "Presupuesto" },
      { id: "t2", name: "finanzas", display_name: "Finanzas Públicas" },
    ],
    resources: [
      {
        id: "res-1",
        url: "https://datos.gob.ar/presupuesto.csv",
        format: "CSV",
        name: "Presupuesto completo",
        size: 1048576,
      },
      {
        id: "res-2",
        url: "https://datos.gob.ar/presupuesto.json",
        format: "json",
        name: "Presupuesto JSON",
      },
    ],
    license_title: "Creative Commons Attribution",
    metadata_created: "2024-01-15T10:00:00Z",
    metadata_modified: "2024-06-01T14:30:00Z",
  };

  it("maps a complete CKAN package to DatasetRecord", () => {
    const record = mapCkanPackage(fullPackage, CATALOG_ID);

    expect(record.id).toBe("datos-gob-ar:presupuesto-nacional-2024");
    expect(record.catalogId).toBe(CATALOG_ID);
    expect(record.externalId).toBe("presupuesto-nacional-2024");
    expect(record.title).toBe("Presupuesto Nacional 2024");
    expect(record.description).toBe("Datos del presupuesto nacional.");
    expect(record.organization).toBe("Ministerio de Economía");
    expect(record.tags).toEqual(["Presupuesto", "Finanzas Públicas"]);
    expect(record.license).toBe("Creative Commons Attribution");
    expect(record.createdAt).toBe("2024-01-15T10:00:00Z");
    expect(record.modifiedAt).toBe("2024-06-01T14:30:00Z");
  });

  it("maps resources with format uppercased", () => {
    const record = mapCkanPackage(fullPackage, CATALOG_ID);

    expect(record.resources).toHaveLength(2);
    expect(record.resources[0].format).toBe("CSV");
    expect(record.resources[1].format).toBe("JSON");
  });

  it("maps resource size when present", () => {
    const record = mapCkanPackage(fullPackage, CATALOG_ID);

    expect(record.resources[0].sizeBytes).toBe(1048576);
    expect(record.resources[1].sizeBytes).toBeUndefined();
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: CkanPackage = {
      id: "xyz",
      name: "minimal-dataset",
      title: "",
    };

    const record = mapCkanPackage(minimal, CATALOG_ID);

    expect(record.id).toBe("datos-gob-ar:minimal-dataset");
    expect(record.title).toBe("minimal-dataset"); // fallback to name
    expect(record.description).toBeUndefined();
    expect(record.organization).toBeUndefined();
    expect(record.tags).toEqual([]);
    expect(record.license).toBeUndefined();
    expect(record.resources).toEqual([]);
  });

  it("uses organization name when title is missing", () => {
    const pkg: CkanPackage = {
      id: "abc",
      name: "test",
      title: "Test",
      organization: { id: "o1", name: "org-slug", title: "" },
    };

    const record = mapCkanPackage(pkg, CATALOG_ID);
    expect(record.organization).toBe("org-slug");
  });

  it("uses tag name when display_name is missing", () => {
    const pkg: CkanPackage = {
      id: "abc",
      name: "test",
      title: "Test",
      tags: [{ id: "t1", name: "raw-tag" }],
    };

    const record = mapCkanPackage(pkg, CATALOG_ID);
    expect(record.tags).toEqual(["raw-tag"]);
  });
});
