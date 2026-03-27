import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogScores, CatalogsOutput, PipelineMeta } from "@agora/sdk";

export interface WriteOutputArgs {
  outputDir: string;
  catalogs: CatalogsOutput;
  catalogScores: CatalogScores[];
  meta: PipelineMeta;
}

/**
 * Write pipeline results to disk:
 *   {outputDir}/catalogs.json
 *   {outputDir}/catalogs/{id}/scores.json
 *   {outputDir}/meta.json
 */
export async function writeOutput(args: WriteOutputArgs): Promise<void> {
  const { outputDir, catalogs, catalogScores, meta } = args;

  await mkdir(outputDir, { recursive: true });

  await writeFile(join(outputDir, "catalogs.json"), JSON.stringify(catalogs, null, 2), "utf-8");

  for (const scores of catalogScores) {
    const dir = join(outputDir, "catalogs", scores.catalogId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "scores.json"), JSON.stringify(scores, null, 2), "utf-8");
  }

  await writeFile(join(outputDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}
