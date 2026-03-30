import type { Logger } from "../../logger.js";
import { CircuitBreaker, CircuitBreakerError, jitteredBackoff } from "../../circuit-breaker.js";
import type {
  ArSeriesDataResponse,
  ArSeriesSearchResponse,
} from "./types.js";

export { CircuitBreakerError };

const BASE_URL = "https://apis.datos.gob.ar/series/api";

export interface ArSeriesClientOptions {
  /** Request timeout in ms (default: 15_000). */
  timeoutMs?: number;
  /** Max retries on transient errors (default: 3). */
  maxRetries?: number;
}

export class ArSeriesClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly options: ArSeriesClientOptions = {},
    private readonly logger: Logger,
  ) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.breaker = new CircuitBreaker("series:apis.datos.gob.ar");
  }

  /** Search series by keyword. */
  async search(query: string, limit = 10, start = 0): Promise<ArSeriesSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      start: String(start),
      format: "json",
    });
    return this.get<ArSeriesSearchResponse>(`${BASE_URL}/search/?${params}`);
  }

  /** Fetch data for one or more series IDs. */
  async getData(
    ids: string[],
    options?: {
      startDate?: string;
      endDate?: string;
      collapse?: string;
      aggregation?: string;
      limit?: number;
    },
  ): Promise<ArSeriesDataResponse> {
    const params = new URLSearchParams({
      ids: ids.join(","),
      format: "json",
      limit: String(options?.limit ?? 1000),
    });
    if (options?.startDate) params.set("start_date", options.startDate);
    if (options?.endDate) params.set("end_date", options.endDate);
    if (options?.collapse) params.set("collapse", options.collapse);
    if (options?.aggregation) params.set("collapse_aggregation", options.aggregation);
    return this.get<ArSeriesDataResponse>(`${BASE_URL}/series/?${params}`);
  }

  /** HTTP GET with circuit breaker, retry, and timeout. */
  private async get<T>(url: string): Promise<T> {
    return this.getWithRetry<T>(url, 0);
  }

  private async getWithRetry<T>(url: string, attempt: number): Promise<T> {
    try {
      return await this.breaker.execute(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }

          return (await res.json()) as T;
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (error) {
      // Never retry circuit breaker errors
      if (error instanceof CircuitBreakerError) throw error;

      if (attempt < this.maxRetries) {
        const delay = jitteredBackoff(attempt);
        this.logger.debug("ArSeriesClient retrying", { url, attempt, delay });
        await new Promise((r) => setTimeout(r, delay));
        return this.getWithRetry<T>(url, attempt + 1);
      }

      throw error;
    }
  }
}
