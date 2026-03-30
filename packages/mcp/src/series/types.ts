/**
 * Shared types for the time series subsystem.
 *
 * Time series are a separate domain from open-data catalogs:
 * they expose temporal data points (date→value) from official
 * statistical APIs, not downloadable file resources.
 */

/** A single data point in a time series. */
export interface TimeSeriesDataPoint {
  date: string; // ISO date (YYYY-MM-DD)
  value: number | null;
}

/** Metadata describing a discoverable series. */
export interface SeriesMetadata {
  id: string;
  title: string;
  description?: string;
  frequency: string; // "daily" | "monthly" | "quarterly" | "yearly"
  units: string;
  source: string; // Issuing institution (e.g. "INDEC", "BCRA")
  theme?: string;
  startDate?: string;
  endDate?: string;
}

/** Result of querying a series for data. */
export interface TimeSeriesResult {
  series: SeriesMetadata;
  data: TimeSeriesDataPoint[];
  count: number;
}

/** Result of searching for series by keyword. */
export interface SeriesSearchResult {
  results: SeriesMetadata[];
  total: number;
}

/** Options for querying series data. */
export interface TimeSeriesQueryOptions {
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  collapse?: "day" | "month" | "quarter" | "year";
  aggregation?: "avg" | "sum" | "min" | "max" | "end_of_period";
  limit?: number;
}

/** Registered time series source. */
export interface TimeSeriesSource {
  id: string; // e.g. "argentina"
  name: string; // e.g. "Series de Tiempo — Argentina"
  description: string;
}
