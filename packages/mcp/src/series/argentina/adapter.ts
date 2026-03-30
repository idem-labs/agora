import type { Logger } from "../../logger.js";
import type { TimeSeriesAdapter } from "../adapter.js";
import type {
  TimeSeriesSource,
  SeriesMetadata,
  SeriesSearchResult,
  TimeSeriesResult,
  TimeSeriesQueryOptions,
} from "../types.js";
import { ArSeriesClient, type ArSeriesClientOptions } from "./client.js";
import {
  mapSearchResult,
  extractMetadataFromDataResponse,
  mapDataPoints,
  toApiCollapse,
} from "./mapper.js";

export class ArgentinaSeriesAdapter implements TimeSeriesAdapter {
  readonly source: TimeSeriesSource = {
    id: "argentina",
    name: "Series de Tiempo — Argentina",
    description:
      "Series temporales de indicadores económicos argentinos (INDEC, BCRA, ministerios). " +
      "Incluye IPC, EMAE, tipo de cambio, reservas, empleo, y más.",
  };

  private readonly client: ArSeriesClient;

  constructor(options?: ArSeriesClientOptions, logger?: Logger) {
    this.client = new ArSeriesClient(options, logger ?? console as unknown as Logger);
  }

  async searchSeries(query: string, limit = 10): Promise<SeriesSearchResult> {
    const response = await this.client.search(query, limit);
    return {
      results: response.data.map(mapSearchResult),
      total: response.count,
    };
  }

  async querySeries(
    seriesId: string,
    options?: TimeSeriesQueryOptions,
  ): Promise<TimeSeriesResult> {
    const response = await this.client.getData([seriesId], {
      startDate: options?.startDate,
      endDate: options?.endDate,
      collapse: options?.collapse ? toApiCollapse(options.collapse) : undefined,
      aggregation: options?.aggregation,
      limit: options?.limit,
    });

    const metadata = extractMetadataFromDataResponse(response);
    if (!metadata) {
      throw new Error(`No se encontró la serie: ${seriesId}`);
    }

    return {
      series: metadata,
      data: mapDataPoints(response.data),
      count: response.count,
    };
  }

  async getSeriesMetadata(seriesId: string): Promise<SeriesMetadata | null> {
    // Fetch minimal data (1 point) to get metadata
    const response = await this.client.getData([seriesId], { limit: 1 });
    return extractMetadataFromDataResponse(response);
  }
}
