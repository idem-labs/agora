import type {
  TimeSeriesSource,
  SeriesMetadata,
  SeriesSearchResult,
  TimeSeriesResult,
  TimeSeriesQueryOptions,
} from "./types.js";

/**
 * Common interface for time series data sources.
 *
 * Each adapter wraps a national/international statistics API
 * (Argentina INDEC/BCRA, FRED, Eurostat, World Bank, etc.)
 * and normalizes it to the shared series types.
 */
export interface TimeSeriesAdapter {
  /** Source metadata (id, name, description). */
  readonly source: TimeSeriesSource;

  /** Search for available series by keyword. */
  searchSeries(query: string, limit?: number): Promise<SeriesSearchResult>;

  /** Query data points for a specific series. */
  querySeries(seriesId: string, options?: TimeSeriesQueryOptions): Promise<TimeSeriesResult>;

  /** Get metadata for a specific series by ID. */
  getSeriesMetadata(seriesId: string): Promise<SeriesMetadata | null>;
}
