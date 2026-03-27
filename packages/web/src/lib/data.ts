import { readFile } from "fs/promises";
import { join } from "path";
import { cache } from "react";
import type { CatalogsOutput, CatalogSummary, CatalogScores, PipelineMeta } from "@agora/sdk";

/** Base directory for pipeline output data. */
const DATA_DIR = process.env.AGORA_DATA_DIR || join(process.cwd(), "data");

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

export const getCatalogs = cache(async (): Promise<CatalogSummary[]> => {
  const data = await readJson<CatalogsOutput>(join(DATA_DIR, "catalogs.json"));
  return data.catalogs;
});

export async function getCatalogById(id: string): Promise<CatalogSummary | undefined> {
  const catalogs = await getCatalogs();
  return catalogs.find((c) => c.id === id);
}

export async function getCatalogScores(catalogId: string): Promise<CatalogScores> {
  return readJson<CatalogScores>(
    join(DATA_DIR, "catalogs", catalogId, "scores.json"),
  );
}

export async function getMeta(): Promise<PipelineMeta> {
  return readJson<PipelineMeta>(join(DATA_DIR, "meta.json"));
}

export async function getGlobalStats() {
  const catalogs = await getCatalogs();

  const totalDatasets = catalogs.reduce((s, c) => s + c.datasetCount, 0);
  const totalResources = catalogs.reduce((s, c) => s + c.resourceCount, 0);
  const avgOverall =
    catalogs.length > 0
      ? catalogs.reduce((s, c) => s + c.scores.overall, 0) / catalogs.length
      : 0;
  const avgAccessibility =
    catalogs.length > 0
      ? catalogs.reduce((s, c) => s + c.scores.accessibility, 0) / catalogs.length
      : 0;

  return {
    catalogCount: catalogs.length,
    totalDatasets,
    totalResources,
    avgOverall,
    avgAccessibility,
  };
}
