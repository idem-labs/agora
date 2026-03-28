import type { Logger } from "../../logger.js";
import type {
  SocrataDiscoveryResponse,
  SocrataResult,
} from "./socrata-types.js";

export interface SocrataClientOptions {
  /** Portal domain (e.g. "data.cityofnewyork.us", "www.datos.gov.co") */
  domain: string;
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Page size for paginated requests (default: 100) */
  pageSize?: number;
  /** Max retries per page on transient errors (default: 3) */
  maxRetries?: number;
}

/**
 * HTTP client for the Socrata Discovery API (catalog/v1).
 * Uses the per-portal endpoint: https://{domain}/api/catalog/v1
 */
export class SocrataClient {
  private readonly domain: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly maxRetries: number;

  constructor(
    private readonly options: SocrataClientOptions,
    private readonly logger: Logger,
  ) {
    this.domain = options.domain.replace(/\/+$/, "");
    this.baseUrl = `https://${this.domain}/api/catalog/v1`;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pageSize = options.pageSize ?? 100;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /** Fetch a single page of datasets from the Discovery API */
  async searchDatasets(
    offset: number,
    limit?: number,
    extra?: { orderBy?: string; where?: string },
  ): Promise<SocrataDiscoveryResponse> {
    const l = limit ?? this.pageSize;
    let url = `${this.baseUrl}?only=datasets&limit=${l}&offset=${offset}`;
    if (extra?.orderBy) url += `&order=${encodeURIComponent(extra.orderBy)}`;
    if (extra?.where) url += `&q_internal=${encodeURIComponent(extra.where)}`;
    return this.get<SocrataDiscoveryResponse>(url);
  }

  /** Fetch a single dataset by its four-four ID */
  async getDataset(id: string): Promise<SocrataResult | null> {
    const url = `${this.baseUrl}?ids=${encodeURIComponent(id)}`;
    const response = await this.get<SocrataDiscoveryResponse>(url);
    return response.results.length > 0 ? response.results[0] : null;
  }

  /** Iterate over ALL datasets with automatic pagination, retry, and throttling */
  async *listAllDatasets(): AsyncGenerator<SocrataResult[]> {
    let offset = 0;
    let total: number | null = null;
    let pageNum = 0;

    while (total === null || offset < total) {
      // Throttle between pages
      if (pageNum > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      this.logger.debug("Socrata paginating", {
        offset,
        pageSize: this.pageSize,
        total,
        page: pageNum,
      });

      const response = await this.getWithRetry(() =>
        this.searchDatasets(offset),
      );
      total = response.resultSetSize;

      if (response.results.length === 0) break;
      yield response.results;

      offset += response.results.length;
      pageNum++;
    }

    this.logger.info("Socrata pagination complete", {
      total: total ?? 0,
      pages: pageNum,
    });
  }

  /**
   * Iterate over datasets updated since `cursor` (ISO timestamp),
   * ordered by updatedAt ascending. Used by the pipeline for
   * incremental scoring. Falls back to full listing with client-side
   * filtering since Socrata Discovery API has limited query support.
   */
  async *listDatasetsSince(
    cursor: string,
    limit?: number,
  ): AsyncGenerator<SocrataResult[]> {
    const cursorDate = new Date(cursor).getTime();
    const l = limit ?? this.pageSize;
    let offset = 0;
    let total: number | null = null;
    let pageNum = 0;

    while (total === null || offset < total) {
      if (pageNum > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      this.logger.debug("Socrata paginating (since)", { cursor, offset, pageSize: l, total, page: pageNum });

      const response = await this.getWithRetry(() =>
        this.searchDatasets(offset, l),
      );
      total = response.resultSetSize;

      if (response.results.length === 0) break;

      // Client-side filter: only yield results updated after cursor
      const filtered = response.results.filter((r) => {
        const updatedAt = r.resource?.data_updated_at ?? r.resource?.updatedAt;
        if (!updatedAt) return true; // include if no date
        return new Date(updatedAt).getTime() >= cursorDate;
      });

      if (filtered.length > 0) yield filtered;

      offset += response.results.length;
      pageNum++;
    }

    this.logger.info("Socrata pagination (since) complete", { cursor, total: total ?? 0, pages: pageNum });
  }

  /** Retry a request with exponential backoff on transient errors. */
  private async getWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          const delayMs = 1000 * 2 ** attempt;
          this.logger.warn("Socrata request failed, retrying", {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            delayMs,
            error: String(error),
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

  private async get<T>(url: string): Promise<T> {
    this.logger.debug("Socrata GET", { url });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "agora-mcp/0.1" },
      });

      if (!response.ok) {
        throw new Error(
          `Socrata HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Socrata request timed out after ${this.timeoutMs}ms`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
