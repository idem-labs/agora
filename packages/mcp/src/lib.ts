/**
 * Library exports for cross-package reuse (e.g., Platform pipeline).
 * Only exports the catalog layer — no heavy deps (DuckDB, ONNX, vectra).
 */

// Catalog adapter interface
export type { CatalogAdapter } from "./catalogs/adapter.js";

// Catalog registry (factory for adapters)
export { CatalogRegistry } from "./catalogs/catalog-registry.js";

// Catalog directory (built-in portal registry + presets)
export {
  getCatalogEntry,
  getAllCatalogEntries,
  getPreset,
  getAllPresets,
  resolveActiveCatalogs,
} from "./catalogs/directory/index.js";
export type { CatalogEntry, PresetEntry } from "./catalogs/directory/types.js";

// Logger
export { createLogger } from "./logger.js";
export type { Logger } from "./logger.js";

// Config types
export type { LogLevel } from "./config.js";
