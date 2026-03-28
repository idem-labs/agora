/**
 * Cleanup orphaned catalog data directories.
 */
import type { Logger } from "agora-mcp/lib";
import { listCatalogDirs, removeCatalogDir } from "../state/state-store.js";

/**
 * Remove data directories for catalogs no longer in the active set.
 * Returns the list of removed catalog IDs.
 */
export async function cleanupOrphanedCatalogs(
  outputDir: string,
  activeCatalogIds: Set<string>,
  logger: Logger,
): Promise<string[]> {
  const existingDirs = await listCatalogDirs(outputDir);
  const removed: string[] = [];

  for (const dir of existingDirs) {
    if (!activeCatalogIds.has(dir)) {
      await removeCatalogDir(outputDir, dir);
      removed.push(dir);
      logger.info("Cleaned up orphaned catalog data", { catalogId: dir });
    }
  }

  return removed;
}
