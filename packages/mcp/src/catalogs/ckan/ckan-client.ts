import type { Logger } from "../../logger.js";
import type {
  CkanPackage,
  CkanResponse,
  CkanSearchResult,
} from "./ckan-types.js";

export interface CkanClientOptions {
  /** Base URL of the CKAN instance (e.g. "https://datos.gob.ar") */
  baseUrl: string;
  /** Custom API base path (default: "/api/3/action"). For non-standard installs like "/opendata/api/3/action". */
  apiPath?: string;
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Page size for paginated requests (default: 25) */
  pageSize?: number;
  /** Max retries per page on transient errors (default: 3) */
  maxRetries?: number;
}

export class CkanClient {
  private readonly baseUrl: string;
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly maxRetries: number;

  constructor(
    private readonly options: CkanClientOptions,
    private readonly logger: Logger,
  ) {
    // Strip trailing slash
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const apiPath = (options.apiPath ?? "/api/3/action").replace(/\/+$/, "");
    this.apiBase = `${this.baseUrl}${apiPath}`;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pageSize = options.pageSize ?? 25;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /** Fetch a single page of package_search results */
  async searchPackages(
    offset: number,
    rows?: number,
  ): Promise<CkanSearchResult> {
    const r = rows ?? this.pageSize;
    const url = `${this.apiBase}/package_search?rows=${r}&start=${offset}`;
    return this.get<CkanSearchResult>(url);
  }

  /** Fetch a single package by name or ID */
  async getPackage(nameOrId: string): Promise<CkanPackage> {
    const url = `${this.apiBase}/package_search?fq=name:${encodeURIComponent(nameOrId)}&rows=1`;
    const result = await this.get<CkanSearchResult>(url);
    if (result.results.length === 0) {
      // Fallback to package_show for ID-based lookup
      return this.get<CkanPackage>(
        `${this.apiBase}/package_show?id=${encodeURIComponent(nameOrId)}`,
      );
    }
    return result.results[0];
  }

  /** Iterate over ALL packages with automatic pagination, retry, and throttling */
  async *listAllPackages(): AsyncGenerator<CkanPackage[]> {
    let offset = 0;
    let total: number | null = null;
    let pageNum = 0;

    while (total === null || offset < total) {
      // Throttle between pages to avoid overwhelming the server
      if (pageNum > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      this.logger.debug("CKAN paginating", {
        offset,
        pageSize: this.pageSize,
        total,
        page: pageNum,
      });

      const result = await this.getWithRetry(() => this.searchPackages(offset));
      total = result.count;

      if (result.results.length === 0) break;
      yield result.results;

      offset += result.results.length;
      pageNum++;
    }

    this.logger.info("CKAN pagination complete", { total: total ?? 0, pages: pageNum });
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
          const delayMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
          this.logger.warn("CKAN request failed, retrying", {
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
    this.logger.debug("CKAN GET", { url });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "agora-mcp/0.1" },
      });

      if (!response.ok) {
        throw new Error(`CKAN HTTP ${response.status}: ${response.statusText}`);
      }

      const body = (await response.json()) as CkanResponse<T>;

      if (!body.success) {
        throw new Error(
          `CKAN API error: ${body.error?.message ?? "unknown error"}`,
        );
      }

      return body.result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`CKAN request timed out after ${this.timeoutMs}ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
