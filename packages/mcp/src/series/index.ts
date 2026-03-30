export type { TimeSeriesAdapter } from "./adapter.js";
export { TimeSeriesRegistry } from "./registry.js";
export type {
  TimeSeriesSource,
  SeriesMetadata,
  SeriesSearchResult,
  TimeSeriesResult,
  TimeSeriesQueryOptions,
  TimeSeriesDataPoint,
} from "./types.js";
export { ArgentinaSeriesAdapter } from "./argentina/index.js";
export { AR_SERIES_CATALOG, type CatalogedSeries } from "./argentina/series-catalog.js";
