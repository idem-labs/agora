import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogScores, CatalogsOutput, PipelineMeta } from "@agora/sdk";
import type { DatasetsFile } from "../state/types.js";

export interface WriteOutputArgs {
  outputDir: string;
  catalogs: CatalogsOutput;
  catalogScores: CatalogScores[];
  meta: PipelineMeta;
}

/**
 * Write all pipeline results at once (backwards compatible convenience wrapper).
 */
export async function writeOutput(args: WriteOutputArgs): Promise<void> {
  const { outputDir, catalogs, catalogScores, meta } = args;

  await writeCatalogsIndex(outputDir, catalogs);

  for (const scores of catalogScores) {
    await writeCatalogScores(outputDir, scores.catalogId, scores);
  }

  await writeMeta(outputDir, meta);
}

/**
 * Write a single catalog's scores.json.
 */
export async function writeCatalogScores(
  outputDir: string,
  catalogId: string,
  scores: CatalogScores,
): Promise<void> {
  const dir = join(outputDir, "catalogs", catalogId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "scores.json"), JSON.stringify(scores, null, 2), "utf-8");
}

/**
 * Write a single catalog's datasets.json (detail tier only).
 */
export async function writeCatalogDatasets(
  outputDir: string,
  catalogId: string,
  data: DatasetsFile,
): Promise<void> {
  const dir = join(outputDir, "catalogs", catalogId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "datasets.json"), JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Write the global catalogs.json index.
 */
export async function writeCatalogsIndex(
  outputDir: string,
  catalogs: CatalogsOutput,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "catalogs.json"), JSON.stringify(catalogs, null, 2), "utf-8");
}

/**
 * Write the pipeline run metadata.
 */
export async function writeMeta(
  outputDir: string,
  meta: PipelineMeta,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}
