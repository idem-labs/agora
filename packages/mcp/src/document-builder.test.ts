import { describe, it, expect } from "vitest";
import { buildDocument } from "./document-builder.js";
import type { DatasetRecord } from "@agora/sdk";

const base: DatasetRecord = {
  id: "datos-gob-ar:presupuesto-2024",
  catalogId: "datos-gob-ar",
  externalId: "presupuesto-2024",
  title: "Presupuesto Nacional 2024",
  description: "Datos del presupuesto nacional argentino.",
  organization: "Ministerio de Economía",
  tags: ["Presupuesto", "Finanzas Públicas"],
  resources: [
    {
      id: "r1",
      datasetId: "datos-gob-ar:presupuesto-2024",
      url: "https://datos.gob.ar/p.csv",
      format: "CSV",
    },
    {
      id: "r2",
      datasetId: "datos-gob-ar:presupuesto-2024",
      url: "https://datos.gob.ar/p.json",
      format: "JSON",
    },
  ],
};

describe("buildDocument", () => {
  it("includes all fields in the expected order", () => {
    const doc = buildDocument(base);

    expect(doc).toBe(
      "Fuente: Ministerio de Economía. " +
        "Título: Presupuesto Nacional 2024. " +
        "Tema: Presupuesto, Finanzas Públicas. " +
        "Formatos: CSV, JSON. " +
        "Descripción: Datos del presupuesto nacional argentino.",
    );
  });

  it("omits organization when missing", () => {
    const doc = buildDocument({ ...base, organization: undefined });
    expect(doc.startsWith("Título:")).toBe(true);
  });

  it("omits tags section when empty", () => {
    const doc = buildDocument({ ...base, tags: [] });
    expect(doc).not.toContain("Tema:");
  });

  it("omits description when missing", () => {
    const doc = buildDocument({ ...base, description: undefined });
    expect(doc).not.toContain("Descripción:");
  });

  it("omits formats when no resources", () => {
    const doc = buildDocument({ ...base, resources: [] });
    expect(doc).not.toContain("Formatos:");
  });

  it("deduplicates formats (case-insensitive)", () => {
    const record: DatasetRecord = {
      ...base,
      resources: [
        { id: "r1", datasetId: base.id, url: "https://x.com/a.csv", format: "csv" },
        { id: "r2", datasetId: base.id, url: "https://x.com/b.csv", format: "CSV" },
      ],
    };
    const doc = buildDocument(record);
    expect(doc).toContain("Formatos: CSV.");
    // Only one CSV, not "CSV, CSV"
    expect(doc.match(/CSV/g)?.length).toBe(1);
  });

  it("handles minimal record", () => {
    const minimal: DatasetRecord = {
      id: "test:min",
      catalogId: "test",
      externalId: "min",
      title: "Minimal",
      tags: [],
      resources: [],
    };
    expect(buildDocument(minimal)).toBe("Título: Minimal.");
  });
});
