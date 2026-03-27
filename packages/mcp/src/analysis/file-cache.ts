import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../logger.js";

export interface FileCacheOptions {
  /** Base directory for cached files (default: ~/.agora/cache/files) */
  cacheDir: string;
  /** Download timeout in ms (default: 120_000) */
  downloadTimeoutMs?: number;
  /** Max file size in bytes (default: 200 MB) */
  maxFileSizeBytes?: number;
  /** Cache TTL in hours (default: 24) */
  ttlHours?: number;
}

export interface CachedFile {
  /** Absolute path to the cached file on disk */
  path: string;
  /** Whether this was a cache hit (true) or fresh download (false) */
  fromCache: boolean;
}

/** Metadata stored alongside cached files for HTTP conditional requests. */
export interface CacheMeta {
  url: string;
  etag?: string;
  lastModified?: string;
  downloadedAt: string;
  sizeBytes: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_SIZE = 200 * 1024 * 1024; // 200 MB
const DEFAULT_TTL_HOURS = 24;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/** HTTP status codes that are safe to retry. */
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Result of probing a URL for size before downloading. */
export interface ProbeResult {
  /** Content-Length from HEAD request, or null if unavailable. */
  contentLength: number | null;
  /** Whether the file exceeds the max download size (use httpfs instead). */
  exceedsMaxSize: boolean;
}

/** SHA-256 hash of a URL, used as cache key (filename). */
export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export class FileCache {
  private readonly dir: string;
  private readonly timeoutMs: number;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly logger: Logger;

  constructor(opts: FileCacheOptions, logger: Logger) {
    this.dir = opts.cacheDir;
    this.timeoutMs = opts.downloadTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSize = opts.maxFileSizeBytes ?? DEFAULT_MAX_SIZE;
    this.ttlMs = (opts.ttlHours ?? DEFAULT_TTL_HOURS) * 3600_000;
    this.logger = logger;
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Get a file from cache or download it.
   * Returns the absolute path to the cached file.
   *
   * Uses HTTP conditional requests (ETag/Last-Modified) to avoid re-downloading
   * unchanged files, and retries transient failures with exponential backoff.
   */
  async get(url: string): Promise<CachedFile> {
    const key = cacheKey(url);
    const filePath = join(this.dir, key);
    const metaPath = join(this.dir, `${key}.meta.json`);

    // Check cache freshness
    if (existsSync(filePath)) {
      const st = await stat(filePath);
      const age = Date.now() - st.mtimeMs;
      if (age < this.ttlMs) {
        this.logger.debug("file-cache hit", { url, key });
        return { path: filePath, fromCache: true };
      }
      this.logger.debug("file-cache stale", { url, ageHours: age / 3600_000 });
    }

    // Build conditional headers from cached metadata
    const headers: Record<string, string> = {};
    let meta: CacheMeta | undefined;
    if (existsSync(filePath) && existsSync(metaPath)) {
      try {
        meta = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
        if (meta.etag) headers["If-None-Match"] = meta.etag;
        if (meta.lastModified) headers["If-Modified-Since"] = meta.lastModified;
      } catch {
        // Corrupted meta — ignore, will re-download
      }
    }

    // Download with retry
    this.logger.info("Downloading file", { url, conditional: Object.keys(headers).length > 0 });
    const response = await this.fetchWithRetry(url, headers);

    // 304 Not Modified — cache is still valid
    if (response.status === 304 && existsSync(filePath)) {
      this.logger.debug("file-cache 304 Not Modified", { url });
      const now = new Date();
      await utimes(filePath, now, now); // Refresh mtime so TTL resets
      return { path: filePath, fromCache: true };
    }

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }

    // Check content-length before downloading body
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > this.maxSize) {
      throw new Error(
        `File too large (${Number(contentLength)} bytes, max ${this.maxSize}): ${url}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > this.maxSize) {
      throw new Error(
        `File too large (${buffer.length} bytes, max ${this.maxSize}): ${url}`,
      );
    }

    await writeFile(filePath, buffer);
    this.logger.debug("file-cache write", { url, key, size: buffer.length });

    // Save metadata for future conditional requests
    const newMeta: CacheMeta = {
      url,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      downloadedAt: new Date().toISOString(),
      sizeBytes: buffer.length,
    };
    await writeFile(metaPath, JSON.stringify(newMeta, null, 2));

    return { path: filePath, fromCache: false };
  }

  /** Read a cached file as raw buffer. */
  async readBuffer(url: string): Promise<Buffer> {
    const { path } = await this.get(url);
    return readFile(path);
  }

  /** Max download size in bytes. Files larger than this should use httpfs. */
  get downloadLimit(): number {
    return this.maxSize;
  }

  /**
   * Probe a URL to determine if it exceeds the download size limit.
   *
   * - If the file is already cached and fresh, returns exceedsMaxSize=false.
   * - Otherwise, sends a HEAD request to check Content-Length.
   * - If HEAD fails or Content-Length is absent, assumes within limit.
   */
  async probe(url: string): Promise<ProbeResult> {
    // If cached and fresh, it was already downloaded successfully
    const key = cacheKey(url);
    const filePath = join(this.dir, key);
    if (existsSync(filePath)) {
      try {
        const st = await stat(filePath);
        if (Date.now() - st.mtimeMs < this.ttlMs) {
          return { contentLength: st.size, exceedsMaxSize: false };
        }
      } catch {
        // stat failed — fall through to HEAD
      }
    }

    // HEAD request to check Content-Length
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      const cl = response.headers.get("content-length");
      const size = cl ? Number(cl) : null;
      return {
        contentLength: size,
        exceedsMaxSize: size != null && size > this.maxSize,
      };
    } catch {
      // HEAD failed — can't determine size, assume within limit
      this.logger.debug("HEAD probe failed, assuming within limit", { url });
      return { contentLength: null, exceedsMaxSize: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch with exponential backoff retry.
   * Retries on network errors and transient HTTP status codes (429, 5xx).
   * Fails fast on client errors (4xx except 429).
   */
  private async fetchWithRetry(
    url: string,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          headers: extraHeaders,
          signal: controller.signal,
        });

        // 304 or 2xx — success, return immediately
        if (response.status === 304 || response.ok) {
          return response;
        }

        // Retriable server error — retry with backoff
        if (RETRIABLE_STATUS.has(response.status)) {
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < MAX_RETRIES) {
            const delay = this.retryDelay(attempt, response);
            this.logger.warn("Retrying download", {
              url, attempt, status: response.status, delayMs: delay,
            });
            await sleep(delay);
            continue;
          }
          // Last attempt — return the error response for caller to handle
          return response;
        }

        // Non-retriable error (400, 403, 404, etc.) — fail fast
        return response;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < MAX_RETRIES && isRetriableNetworkError(err)) {
          const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
          this.logger.warn("Retrying download (network error)", {
            url, attempt, error: String(err), delayMs: delay,
          });
          await sleep(delay);
          continue;
        }

        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(`Download timed out after ${this.timeoutMs}ms: ${url}`, { cause: err });
        }
        throw new Error(`Download failed: ${url} — ${String(err)}`, { cause: err });
      } finally {
        clearTimeout(timer);
      }
    }

    // Should not reach here, but just in case
    throw new Error(`Download failed after ${MAX_RETRIES} attempts: ${url}`, { cause: lastError });
  }

  /** Calculate retry delay, respecting Retry-After header for 429 responses. */
  private retryDelay(attempt: number, response: Response): number {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, 30_000); // Cap at 30s
      }
    }
    return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  }
}

/** Check if a network error is transient and worth retrying. */
function isRetriableNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const msg = String(err);
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_SOCKET|fetch failed/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
