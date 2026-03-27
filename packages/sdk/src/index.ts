export const VERSION = "0.0.1";

// Domain models (stable)
export {
  CatalogType,
  Catalog,
  Resource,
  DatasetRecord,
} from "./catalog.js";

// Event schemas (tentative — for Platform integration)
export {
  SearchEvent,
  QueryEvent,
  InspectEvent,
  ErrorEvent,
  UsageEvent,
  EventBatch,
} from "./events.js";

// Quality scoring (tentative — for Platform integration)
export {
  QualityDimension,
  DimensionScore,
  QualityScore,
  QUALITY_WEIGHTS,
} from "./quality.js";

// API contracts (tentative — for Platform integration)
export {
  EventBatchRequest,
  EventBatchResponse,
  DatasetScoreResponse,
  CatalogListResponse,
} from "./api.js";

// Pipeline output types (shared between Platform and Web)
export type {
  CatalogSummary,
  CatalogScores,
  PipelineMeta,
  CatalogsOutput,
} from "./output.js";
