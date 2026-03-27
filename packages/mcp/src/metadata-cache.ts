import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { DatasetRecord } from "@agora/sdk";
import type { Logger } from "./logger.js";

interface CachedMetadata {
  cachedAt: string;
  catalogId: string;
  datasets: DatasetRecord[];
}

export class MetadataCache {
  constructor(
    private readonly dataDir: string,
    private readonly logger: Logger,
  ) {}

  private filePath(catalogId: string): string {
    return join(this.dataDir, "metadata", `${catalogId}.json`);
  }

  /** Check if the cache file exists and is within TTL. */
  async isFresh(catalogId: string, ttlHours: number): Promise<boolean> {
    try {
      const raw = await readFile(this.filePath(catalogId), "utf-8");
      const cached: CachedMetadata = JSON.parse(raw);
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      const ttlMs = ttlHours * 60 * 60 * 1000;
      return age < ttlMs;
    } catch {
      return false;
    }
  }

  /** Load cached datasets. Throws if file doesn't exist or is corrupt. */
  async load(catalogId: string): Promise<DatasetRecord[]> {
    const raw = await readFile(this.filePath(catalogId), "utf-8");
    const cached: CachedMetadata = JSON.parse(raw);
    this.logger.info("MetadataCache: loaded from disk", {
      catalogId,
      count: cached.datasets.length,
      cachedAt: cached.cachedAt,
    });
    return cached.datasets;
  }

  /** Save datasets to disk cache. Creates directories if needed. */
  async save(catalogId: string, datasets: DatasetRecord[]): Promise<void> {
    const path = this.filePath(catalogId);
    await mkdir(dirname(path), { recursive: true });

    const cached: CachedMetadata = {
      cachedAt: new Date().toISOString(),
      catalogId,
      datasets,
    };

    await writeFile(path, JSON.stringify(cached));
    this.logger.info("MetadataCache: saved to disk", {
      catalogId,
      count: datasets.length,
      path,
    });
  }
}
