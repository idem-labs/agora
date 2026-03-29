export const VERSION = "0.0.1";

// Domain models (stable)
export {
  CatalogType,
  Catalog,
  Resource,
  DatasetRecord,
} from "./catalog.js";

// Quality scoring
export {
  QualityDimension,
  DimensionScore,
  QualityScore,
  QUALITY_WEIGHTS,
} from "./quality.js";

// Pipeline output types (shared between Platform and Web)
export type {
  CatalogSummary,
  CatalogScores,
  PipelineMeta,
  CatalogsOutput,
} from "./output.js";
