/**
 * Classifies catalogs into tiers (detail vs aggregate) and sorts by priority.
 */
import { resolveActiveCatalogs, type CatalogEntry } from "agora-mcp/lib";
import type { CatalogTier } from "../state/types.js";

export interface ClassifiedCatalog {
  entry: CatalogEntry;
  tier: CatalogTier;
}

/**
 * Classify catalogs into detail/aggregate tiers and sort by priority.
 *
 * @param entries - All active catalog entries
 * @param detailPresets - Preset IDs whose catalogs get "detail" tier (e.g., ["argentina", "latam"])
 * @param priorityPresets - Preset IDs in priority order (e.g., ["argentina", "latam", "all"])
 */
export function classifyCatalogs(
  entries: CatalogEntry[],
  detailPresets: string[],
  priorityPresets: string[],
): ClassifiedCatalog[] {
  // Resolve which catalog IDs belong to detail tier
  const detailIds = new Set<string>();
  for (const preset of detailPresets) {
    const resolved = resolveActiveCatalogs([preset], []);
    for (const e of resolved) detailIds.add(e.id);
  }

  // Classify each entry
  const classified = entries.map((entry) => ({
    entry,
    tier: (detailIds.has(entry.id) ? "detail" : "aggregate") as CatalogTier,
  }));

  // Build priority order from presets
  const priorityOrder = new Map<string, number>();
  let order = 0;
  for (const preset of priorityPresets) {
    const resolved = resolveActiveCatalogs([preset], []);
    for (const e of resolved) {
      if (!priorityOrder.has(e.id)) {
        priorityOrder.set(e.id, order++);
      }
    }
  }

  // Sort: detail first, then by priority order
  classified.sort((a, b) => {
    // Detail before aggregate
    if (a.tier !== b.tier) return a.tier === "detail" ? -1 : 1;
    // Within same tier, by priority
    const pa = priorityOrder.get(a.entry.id) ?? Infinity;
    const pb = priorityOrder.get(b.entry.id) ?? Infinity;
    return pa - pb;
  });

  return classified;
}
