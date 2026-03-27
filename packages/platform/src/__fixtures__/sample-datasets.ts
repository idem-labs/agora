import type { DatasetRecord, Resource } from "@agora/sdk";

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "r1",
    datasetId: "test:ds1",
    url: "https://example.com/data.csv",
    format: "CSV",
    ...overrides,
  };
}

/** All fields populated, multiple resources, recently updated. */
export function makeFullDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: "test:ds-full",
    catalogId: "test",
    externalId: "ds-full",
    title: "Presupuesto Nacional 2024",
    description: "Datos detallados del presupuesto nacional por partida, incluyendo ejecución trimestral.",
    organization: "Ministerio de Economía",
    tags: ["presupuesto", "finanzas", "gasto público"],
    license: "Creative Commons Attribution 4.0",
    resources: [
      makeResource({ id: "r1", format: "CSV", url: "https://example.com/presupuesto.csv" }),
      makeResource({ id: "r2", format: "JSON", url: "https://example.com/presupuesto.json" }),
      makeResource({ id: "r3", format: "PDF", url: "https://example.com/presupuesto.pdf" }),
    ],
    createdAt: "2024-01-15T10:00:00Z",
    modifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Only required fields — minimum viable dataset. */
export function makeMinimalDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: "test:ds-minimal",
    catalogId: "test",
    externalId: "ds-minimal",
    title: "Dataset",
    tags: [],
    resources: [],
    ...overrides,
  };
}

/** Has modifiedAt far in the past (2 years ago). */
export function makeStaleDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  return {
    id: "test:ds-stale",
    catalogId: "test",
    externalId: "ds-stale",
    title: "Censo 2022",
    description: "Resultados del censo nacional de población.",
    organization: "INDEC",
    tags: ["censo", "población"],
    license: "Open Data",
    resources: [
      makeResource({ id: "r1", format: "CSV", url: "https://example.com/censo.csv" }),
    ],
    createdAt: "2022-01-01T00:00:00Z",
    modifiedAt: twoYearsAgo.toISOString(),
    ...overrides,
  };
}

/** Short description + only PDF resources. */
export function makeLowQualityDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: "test:ds-low",
    catalogId: "test",
    externalId: "ds-low",
    title: "Datos varios",
    description: "Sin detalle.",
    tags: [],
    resources: [
      makeResource({ id: "r1", format: "PDF", url: "https://example.com/doc.pdf" }),
    ],
    ...overrides,
  };
}
