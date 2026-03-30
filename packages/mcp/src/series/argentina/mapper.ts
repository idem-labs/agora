import type { SeriesMetadata, TimeSeriesDataPoint } from "../types.js";
import type {
  ArSearchResult,
  ArSeriesDataResponse,
  ArSeriesFieldMeta,
} from "./types.js";

/** Map ISO 8601 recurrence to human-readable frequency. */
const FREQUENCY_MAP: Record<string, string> = {
  "R/P1D": "daily",
  "R/P1M": "monthly",
  "R/P3M": "quarterly",
  "R/P6M": "semiannual",
  "R/P1Y": "yearly",
  day: "daily",
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
};

export function normalizeFrequency(raw: string): string {
  return FREQUENCY_MAP[raw] ?? raw;
}

/** Collapse param name for the API from our normalized names. */
const COLLAPSE_MAP: Record<string, string> = {
  day: "day",
  month: "month",
  quarter: "quarter",
  year: "year",
};

export function toApiCollapse(collapse: string): string {
  return COLLAPSE_MAP[collapse] ?? collapse;
}

/** Map a search result to SeriesMetadata. */
export function mapSearchResult(result: ArSearchResult): SeriesMetadata {
  return {
    id: result.field.id,
    title: result.field.title,
    description: result.field.description,
    frequency: normalizeFrequency(result.field.frequency),
    units: result.field.units,
    source: result.dataset.source,
    theme: result.dataset.theme,
    startDate: result.field.time_index_start,
    endDate: result.field.time_index_end,
  };
}

/** Extract SeriesMetadata from a data response's meta array. */
export function mapFieldMeta(meta: ArSeriesFieldMeta): SeriesMetadata {
  return {
    id: meta.field.id,
    title: meta.field.description || meta.distribution.title,
    description: meta.dataset.description,
    frequency: normalizeFrequency(meta.catalog.title), // temporal meta has the freq
    units: meta.field.units,
    source: meta.dataset.source,
    theme: meta.dataset.theme?.[0],
    startDate: undefined,
    endDate: undefined,
  };
}

/** Extract SeriesMetadata from data response, using temporal meta for frequency. */
export function extractMetadataFromDataResponse(
  response: ArSeriesDataResponse,
): SeriesMetadata | null {
  // meta[0] is temporal, meta[1+] are per-series field metadata
  if (response.meta.length < 2) return null;
  const temporal = response.meta[0] as { frequency?: string; start_date?: string; end_date?: string };
  const field = response.meta[1] as ArSeriesFieldMeta;

  return {
    id: field.field.id,
    title: field.field.description || field.distribution.title,
    description: field.dataset.description,
    frequency: normalizeFrequency(temporal.frequency ?? ""),
    units: field.field.units,
    source: field.dataset.source,
    theme: field.dataset.theme?.[0],
    startDate: temporal.start_date,
    endDate: temporal.end_date,
  };
}

/** Map raw data array to TimeSeriesDataPoint[]. */
export function mapDataPoints(data: [string, ...Array<number | null>][]): TimeSeriesDataPoint[] {
  return data.map(([date, value]) => ({ date, value: value ?? null }));
}
