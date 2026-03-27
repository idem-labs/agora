import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatasetRecord } from "@agora/sdk";
import { DuckDbFtsIndex } from "./fts-index.js";
import { closeAllDatabases } from "../../duckdb.js";

const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

const sampleRecords: DatasetRecord[] = [
  {
    id: "cat:presupuesto-2024",
    catalogId: "cat",
    externalId: "presupuesto-2024",
    title: "Presupuesto Nacional 2024",
    description: "Datos del presupuesto de gastos y recursos del gobierno nacional",
    organization: "Ministerio de Economía",
    tags: ["presupuesto", "gasto público", "finanzas"],
    resources: [],
  },
  {
    id: "cat:empleo-registrado",
    catalogId: "cat",
    externalId: "empleo-registrado",
    title: "Empleo registrado",
    description: "Estadísticas de empleo registrado del sector privado",
    organization: "Ministerio de Trabajo",
    tags: ["empleo", "trabajo", "mercado laboral"],
    resources: [],
  },
  {
    id: "cat:censo-2022",
    catalogId: "cat",
    externalId: "censo-2022",
    title: "Censo Nacional de Población 2022",
    description: "Resultados del censo nacional de población, hogares y viviendas",
    organization: "INDEC",
    tags: ["censo", "población", "demografía"],
    resources: [],
  },
  {
    id: "cat:transporte-publico",
    catalogId: "cat",
    externalId: "transporte-publico",
    title: "Datos de transporte público",
    description: "Información sobre líneas de colectivos, subtes y trenes",
    organization: "Ministerio de Transporte",
    tags: ["transporte", "movilidad", "colectivos"],
    resources: [],
  },
  {
    id: "cat:educacion-matricula",
    catalogId: "cat",
    externalId: "educacion-matricula",
    title: "Matrícula educativa por nivel",
    description: "Cantidad de alumnos por nivel educativo y jurisdicción",
    organization: "Ministerio de Educación",
    tags: ["educación", "matrícula", "alumnos"],
    resources: [],
  },
];

describe("DuckDbFtsIndex", () => {
  let dataDir: string;
  let index: DuckDbFtsIndex;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "agora-fts-"));
    index = new DuckDbFtsIndex("cat", "es", "AR", dataDir, logger);
  });

  afterEach(async () => {
    closeAllDatabases();
    // Small delay to let DuckDB release file handles on Windows
    await new Promise((r) => setTimeout(r, 50));
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  it("builds index from records", async () => {
    await index.build(sampleRecords);

    expect(index.itemCount()).toBe(5);
    expect(index.isReady()).toBe(true);
  });

  it("is not ready before build", () => {
    expect(index.isReady()).toBe(false);
    expect(index.itemCount()).toBe(0);
  });

  it("returns empty results before build", async () => {
    const results = await index.search("presupuesto");
    expect(results).toEqual([]);
  });

  it("finds datasets by title keyword", async () => {
    await index.build(sampleRecords);

    const results = await index.search("presupuesto");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("cat:presupuesto-2024");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("finds datasets by organization", async () => {
    await index.build(sampleRecords);

    const results = await index.search("INDEC");
    expect(results.length).toBeGreaterThan(0);
    // The INDEC record should appear
    const ids = results.map((r) => r.id);
    expect(ids).toContain("cat:censo-2022");
  });

  it("finds datasets by tag content", async () => {
    await index.build(sampleRecords);

    const results = await index.search("demografía");
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("cat:censo-2022");
  });

  it("applies field weighting (title > description)", async () => {
    await index.build(sampleRecords);

    // "empleo" appears in title of empleo-registrado and description of empleo-registrado
    const results = await index.search("empleo");
    expect(results.length).toBeGreaterThan(0);
    // The dataset with "empleo" in the title should score highest
    expect(results[0].id).toBe("cat:empleo-registrado");
  });

  it("respects limit parameter", async () => {
    await index.build(sampleRecords);

    const results = await index.search("datos", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("builds index with empty records", async () => {
    await index.build([]);
    expect(index.itemCount()).toBe(0);
    expect(index.isReady()).toBe(false);
  });

  it("handles query expansion with synonyms", async () => {
    await index.build(sampleRecords);

    // "gasto" is a synonym of "presupuesto" in es.json
    // With query expansion, searching "gasto" should find presupuesto-2024
    const results = await index.search("gasto público");
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("cat:presupuesto-2024");
  });

  it("handles multi-word queries", async () => {
    await index.build(sampleRecords);

    const results = await index.search("censo población");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("cat:censo-2022");
  });

  it("returns results sorted by score descending", async () => {
    await index.build(sampleRecords);

    const results = await index.search("transporte movilidad");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
