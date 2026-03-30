import type { Logger } from "../logger.js";
import type { TimeSeriesAdapter } from "./adapter.js";
import type { TimeSeriesSource } from "./types.js";
import { ArgentinaSeriesAdapter } from "./argentina/adapter.js";

/**
 * Registry of available time series data sources.
 *
 * Currently supports Argentina (apis.datos.gob.ar/series).
 * Extensible to FRED (US), ONS (UK), Eurostat (EU), World Bank.
 */
export class TimeSeriesRegistry {
  private readonly adapters = new Map<string, TimeSeriesAdapter>();

  constructor(logger: Logger) {
    // Register built-in sources
    const argentina = new ArgentinaSeriesAdapter(undefined, logger);
    this.adapters.set(argentina.source.id, argentina);
  }

  /** Get an adapter by source ID (e.g. "argentina"). */
  get(sourceId: string): TimeSeriesAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  /** List all available sources. */
  listSources(): TimeSeriesSource[] {
    return Array.from(this.adapters.values()).map((a) => a.source);
  }

  /** Get all source IDs. */
  sourceIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}
