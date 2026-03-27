/**
 * HealthCache — on-demand resource health status with local persistence.
 *
 * Stores HEAD-request results per resource URL in a JSON file per catalog.
 * Only populated when the LLM explicitly calls verificar_recursos.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceHealth {
  /** HTTP status code from HEAD request (0 = network error). */
  status: number;
  /** Response latency in ms. */
  latencyMs: number;
  /** Content-Length header value, if present. */
  contentLength: number | null;
  /** Content-Type header value, if present. */
  contentType: string | null;
  /** ISO timestamp of when this check was performed. */
  checkedAt: string;
}

export interface HealthCacheData {
  resources: Record<string, ResourceHealth>;
}

export interface HealthCacheOptions {
  /** Base directory for health data (default: ~/.agora/data/health) */
  healthDir: string;
  /** TTL for cached health results in hours (default: 48) */
  healthTtlHours?: number;
  /** Timeout for HEAD requests in ms (default: 10_000) */
  headTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_HOURS = 48;
const DEFAULT_HEAD_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// HealthCache
// ---------------------------------------------------------------------------

export class HealthCache {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly headTimeoutMs: number;
  private readonly logger: Logger;

  /** In-memory cache, loaded lazily per catalog. */
  private readonly data = new Map<string, HealthCacheData>();

  constructor(opts: HealthCacheOptions, logger: Logger) {
    this.dir = opts.healthDir;
    this.ttlMs = (opts.healthTtlHours ?? DEFAULT_TTL_HOURS) * 3600_000;
    this.headTimeoutMs = opts.headTimeoutMs ?? DEFAULT_HEAD_TIMEOUT_MS;
    this.logger = logger;
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Check a single URL via HEAD request.
   * Returns the health result and caches it under the given catalogId.
   */
  async check(catalogId: string, url: string): Promise<ResourceHealth> {
    const cached = this.getCached(catalogId, url);
    if (cached) return cached;

    const health = await this.headRequest(url);
    await this.setCached(catalogId, url, health);
    return health;
  }

  /**
   * Check multiple URLs in parallel.
   * Returns a map of url → ResourceHealth.
   */
  async checkMany(
    catalogId: string,
    urls: string[],
  ): Promise<Map<string, ResourceHealth>> {
    const results = new Map<string, ResourceHealth>();
    const toCheck: string[] = [];

    // Use cached results where available
    for (const url of urls) {
      const cached = this.getCached(catalogId, url);
      if (cached) {
        results.set(url, cached);
      } else {
        toCheck.push(url);
      }
    }

    // HEAD requests in parallel for uncached URLs
    if (toCheck.length > 0) {
      const checks = await Promise.all(
        toCheck.map(async (url) => ({
          url,
          health: await this.headRequest(url),
        })),
      );

      for (const { url, health } of checks) {
        results.set(url, health);
      }

      // Persist all new results
      await this.saveNewResults(catalogId, checks);
    }

    return results;
  }

  /**
   * Get cached health for a URL, if fresh.
   */
  getCached(catalogId: string, url: string): ResourceHealth | undefined {
    const data = this.loadCatalog(catalogId);
    const entry = data.resources[url];
    if (!entry) return undefined;

    const age = Date.now() - new Date(entry.checkedAt).getTime();
    if (age > this.ttlMs) return undefined;

    return entry;
  }

  /**
   * Get all cached health data for a catalog (for search annotation).
   */
  getAllCached(catalogId: string): Record<string, ResourceHealth> {
    return this.loadCatalog(catalogId).resources;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async headRequest(url: string): Promise<ResourceHealth> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.headTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });

      return {
        status: response.status,
        latencyMs: Date.now() - start,
        contentLength: response.headers.get("content-length")
          ? Number(response.headers.get("content-length"))
          : null,
        contentType: response.headers.get("content-type"),
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        status: 0,
        latencyMs: Date.now() - start,
        contentLength: null,
        contentType: null,
        checkedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private loadCatalog(catalogId: string): HealthCacheData {
    if (this.data.has(catalogId)) {
      return this.data.get(catalogId)!;
    }

    const filePath = join(this.dir, `${catalogId}.json`);
    let data: HealthCacheData = { resources: {} };

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8");
        data = JSON.parse(raw) as HealthCacheData;
      } catch {
        this.logger.debug("Health cache corrupted, starting fresh", { catalogId });
      }
    }

    this.data.set(catalogId, data);
    return data;
  }

  private async setCached(
    catalogId: string,
    url: string,
    health: ResourceHealth,
  ): Promise<void> {
    const data = this.loadCatalog(catalogId);
    this.evictStale(data);
    data.resources[url] = health;
    await this.persistRaw(catalogId, data);
  }

  private async saveNewResults(
    catalogId: string,
    results: { url: string; health: ResourceHealth }[],
  ): Promise<void> {
    const data = this.loadCatalog(catalogId);
    this.evictStale(data);
    for (const { url, health } of results) {
      data.resources[url] = health;
    }
    await this.persistRaw(catalogId, data);
  }

  private evictStale(data: HealthCacheData): void {
    const now = Date.now();
    for (const [url, entry] of Object.entries(data.resources)) {
      const age = now - new Date(entry.checkedAt).getTime();
      if (age > this.ttlMs) {
        delete data.resources[url];
      }
    }
  }

  private async persistRaw(
    catalogId: string,
    data: HealthCacheData,
  ): Promise<void> {
    const filePath = join(this.dir, `${catalogId}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }
}
