/**
 * Raw response types for the Argentina Series de Tiempo API.
 * @see https://apis.datos.gob.ar/series/
 */

/** Root response from GET /series/api/series/ */
export interface ArSeriesDataResponse {
  data: [string, ...Array<number | null>][]; // [date, value1, value2, ...]
  count: number;
  meta: ArSeriesMeta[];
  params: ArSeriesParams;
}

/** Metadata returned with data queries — first element is temporal, rest are per-series. */
export type ArSeriesMeta = ArSeriesTemporalMeta | ArSeriesFieldMeta;

export interface ArSeriesTemporalMeta {
  frequency: string;
  start_date: string;
  end_date: string;
}

export interface ArSeriesFieldMeta {
  catalog: { title: string };
  dataset: {
    title: string;
    description?: string;
    issued?: string;
    source: string;
    theme?: string[];
  };
  distribution: {
    title: string;
    downloadURL?: string;
  };
  field: {
    id: string;
    description: string;
    units: string;
    representation_mode?: string;
  };
}

export interface ArSeriesParams {
  ids: string;
  limit: string;
  format: string;
  collapse?: string;
  collapse_aggregation?: string;
  start_date?: string;
  end_date?: string;
  identifiers?: Array<{ id: string; distribution: string; dataset: string }>;
}

/** Root response from GET /series/api/search/ */
export interface ArSeriesSearchResponse {
  data: ArSearchResult[];
  count: number;
  limit: number;
  start: number;
}

export interface ArSearchResult {
  field: {
    id: string;
    title: string;
    description?: string;
    frequency: string; // ISO 8601 recurrence e.g. "R/P1M"
    time_index_start?: string;
    time_index_end?: string;
    units: string;
    hits_90_days?: number;
  };
  dataset: {
    title: string;
    publisher?: { name: string };
    source: string;
    theme?: string;
  };
}
