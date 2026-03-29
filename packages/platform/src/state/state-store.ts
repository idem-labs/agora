/**
 * State store — reads and writes pipeline state files.
 * Handles .state.json (pipeline progress) and datasets.json (detail tier scores).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogState, DatasetsFile } from "./types.js";

// ---------------------------------------------------------------------------
// Catalog state (.state.json)
// ---------------------------------------------------------------------------

function statePath(outputDir: string, catalogId: string): string {
  return join(outputDir, "catalogs", catalogId, ".state.json");
}

export async function readCatalogState(
  outputDir: string,
  catalogId: string,
): Promise<CatalogState | null> {
  const path = statePath(outputDir, catalogId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as CatalogState;
  } catch {
    return null;
  }
}

export async function writeCatalogState(
  outputDir: string,
  catalogId: string,
  state: CatalogState,
): Promise<void> {
  const dir = join(outputDir, "catalogs", catalogId);
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(outputDir, catalogId), JSON.stringify(state, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Datasets file (datasets.json — detail tier only)
// ---------------------------------------------------------------------------

function datasetsPath(outputDir: string, catalogId: string): string {
  return join(outputDir, "catalogs", catalogId, "datasets.json");
}

export async function readDatasetsFile(
  outputDir: string,
  catalogId: string,
): Promise<DatasetsFile | null> {
  const path = datasetsPath(outputDir, catalogId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as DatasetsFile;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Directory operations (for cleanup)
// ---------------------------------------------------------------------------

export async function listCatalogDirs(outputDir: string): Promise<string[]> {
  const catalogsDir = join(outputDir, "catalogs");
  if (!existsSync(catalogsDir)) return [];
  const entries = await readdir(catalogsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function removeCatalogDir(
  outputDir: string,
  catalogId: string,
): Promise<void> {
  const dir = join(outputDir, "catalogs", catalogId);
  await rm(dir, { recursive: true, force: true });
}
