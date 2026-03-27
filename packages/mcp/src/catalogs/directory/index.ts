import catalogsData from "./catalogs.json" with { type: "json" };
import presetsData from "./presets.json" with { type: "json" };
import type { CatalogEntry, PresetEntry } from "./types.js";

const catalogs: CatalogEntry[] = catalogsData as CatalogEntry[];
const presets: PresetEntry[] = presetsData as PresetEntry[];

const catalogMap = new Map<string, CatalogEntry>(
  catalogs.map((c) => [c.id, c]),
);
const presetMap = new Map<string, PresetEntry>(
  presets.map((p) => [p.id, p]),
);

/** Look up a catalog entry by id. */
export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return catalogMap.get(id);
}

/** Get all catalog entries. */
export function getAllCatalogEntries(): CatalogEntry[] {
  return catalogs;
}

/** Look up a preset by id. */
export function getPreset(id: string): PresetEntry | undefined {
  return presetMap.get(id);
}

/** Get all presets. */
export function getAllPresets(): PresetEntry[] {
  return presets;
}

/**
 * Resolve active catalogs from preset names and/or explicit catalog IDs.
 * - If neither is provided, defaults to ["datos-gob-ar"] for backwards compat.
 * - Deduplicates by catalog ID.
 * - Throws if a preset or catalog ID is not found.
 */
export function resolveActiveCatalogs(
  presetIds: string[],
  catalogIds: string[],
): CatalogEntry[] {
  const resolved = new Map<string, CatalogEntry>();

  // Expand presets
  for (const presetId of presetIds) {
    const preset = presetMap.get(presetId);
    if (!preset) {
      throw new Error(`Unknown preset: "${presetId}". Available: ${[...presetMap.keys()].join(", ")}`);
    }
    for (const catId of preset.catalogIds) {
      const entry = catalogMap.get(catId);
      if (entry) {
        resolved.set(catId, entry);
      }
    }
  }

  // Add explicit catalog IDs
  for (const catId of catalogIds) {
    const entry = catalogMap.get(catId);
    if (!entry) {
      throw new Error(`Unknown catalog: "${catId}". Available: ${[...catalogMap.keys()].join(", ")}`);
    }
    resolved.set(catId, entry);
  }

  // Default: datos-gob-ar if nothing specified
  if (resolved.size === 0) {
    const defaultEntry = catalogMap.get("datos-gob-ar");
    if (defaultEntry) {
      resolved.set(defaultEntry.id, defaultEntry);
    }
  }

  return [...resolved.values()];
}

export type { CatalogEntry, PresetEntry };
