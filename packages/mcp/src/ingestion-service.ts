import type { DatasetRecord } from "@agora/sdk";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type { CatalogRegistry } from "./catalogs/catalog-registry.js";
import type { Embedder } from "./search/semantic/embedder.js";
import type { VectorStore } from "./search/semantic/vector-store.js";
import type { DuckDbFtsIndex } from "./search/fts/fts-index.js";
import { MetadataCache } from "./metadata-cache.js";
import { buildDocument } from "./document-builder.js";

/**
 * Orchestrates metadata ingestion: fetch from adapters → cache to disk → FTS index → embed.
 * Provides fast in-memory lookup by dataset ID.
 */
export class IngestionService {
  /** catalogId → Map<datasetId, DatasetRecord> */
  private readonly datasets = new Map<string, Map<string, DatasetRecord>>();
  private readonly cache: MetadataCache;
  /** Tracks which catalogs have been successfully embedded (per-catalog skip logic). */
  private readonly embeddedCatalogs = new Set<string>();

  constructor(
    private readonly registry: CatalogRegistry,
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly ftsIndexes?: Map<string, DuckDbFtsIndex>,
    private readonly embedder?: Embedder,
    private readonly vectorStore?: VectorStore,
  ) {
    this.cache = new MetadataCache(config.dataDir, logger);
  }

  /**
   * Load metadata for all catalogs and build FTS indexes.
   * This is synchronous (blocking) — call before server.connect().
   * Does NOT generate embeddings (use embedInBackground for that).
   */
  async initialize(): Promise<void> {
    const adapters = this.registry.listAdapters();

    for (const adapter of adapters) {
      const catalogId = adapter.catalog.id;
      const start = Date.now();

      try {
        if (await this.cache.isFresh(catalogId, this.config.metadataTtlHours)) {
          const records = await this.cache.load(catalogId);
          this.indexRecords(catalogId, records);
          this.logger.info("Ingestion: loaded from cache", {
            catalogId,
            count: records.length,
            ms: Date.now() - start,
          });
        } else {
          await this.fetchAndCache(adapter, catalogId);
          const count = this.datasets.get(catalogId)?.size ?? 0;
          this.logger.info("Ingestion: fetched from source", {
            catalogId,
            count,
            ms: Date.now() - start,
          });
        }

        // Build FTS index (synchronous, fast)
        await this.buildFtsIfNeeded(catalogId);
      } catch (error) {
        this.logger.error("Ingestion: failed to initialize catalog", {
          catalogId,
          error: String(error),
        });
      }
    }
  }

  /**
   * Generate embeddings in background for all catalogs.
   * Call after server.connect() — non-blocking, fire-and-forget.
   */
  async embedInBackground(): Promise<void> {
    if (!this.embedder || !this.vectorStore) return;

    for (const catalogId of this.datasets.keys()) {
      try {
        await this.embedIfNeeded(catalogId);
      } catch (error) {
        this.logger.error("Background embedding failed", {
          catalogId,
          error: String(error),
        });
      }
    }
  }

  /** Look up a dataset by composite ID ("catalogId:externalId"). */
  getDataset(id: string): DatasetRecord | undefined {
    const sep = id.indexOf(":");
    if (sep === -1) return undefined;

    const catalogId = id.substring(0, sep);
    return this.datasets.get(catalogId)?.get(id);
  }

  /** Get all datasets for a given catalog. */
  getDatasetsByCatalog(catalogId: string): DatasetRecord[] {
    const map = this.datasets.get(catalogId);
    return map ? [...map.values()] : [];
  }

  /** IDs of all ingested catalogs. */
  getCatalogIds(): string[] {
    return [...this.datasets.keys()];
  }

  /** Total number of indexed datasets across all catalogs. */
  get totalCount(): number {
    let count = 0;
    for (const map of this.datasets.values()) {
      count += map.size;
    }
    return count;
  }

  /** Get the FTS index for a specific catalog. */
  getFtsIndex(catalogId: string): DuckDbFtsIndex | undefined {
    return this.ftsIndexes?.get(catalogId);
  }

  getVectorStore(): VectorStore | undefined {
    return this.vectorStore;
  }

  getEmbedder(): Embedder | undefined {
    return this.embedder;
  }

  /** Build FTS index for a catalog from in-memory records. */
  private async buildFtsIfNeeded(catalogId: string): Promise<void> {
    const ftsIndex = this.ftsIndexes?.get(catalogId);
    if (!ftsIndex) return;

    const records = this.getDatasetsByCatalog(catalogId);
    if (records.length === 0) return;

    await ftsIndex.build(records);
  }

  private async fetchAndCache(
    adapter: import("./catalogs/adapter.js").CatalogAdapter,
    catalogId: string,
  ): Promise<void> {
    const records: DatasetRecord[] = [];
    for await (const record of adapter.listDatasets()) {
      records.push(record);
    }
    this.indexRecords(catalogId, records);
    await this.cache.save(catalogId, records);
  }

  private indexRecords(catalogId: string, records: DatasetRecord[]): void {
    const map = new Map<string, DatasetRecord>();
    for (const record of records) {
      map.set(record.id, record);
    }
    this.datasets.set(catalogId, map);
  }

  /**
   * Generate embeddings and upsert into vector store when needed.
   * Skips if: no embedder/vectorStore, or catalog already embedded in this process.
   */
  private async embedIfNeeded(catalogId: string): Promise<void> {
    if (!this.embedder || !this.vectorStore) return;

    const records = this.getDatasetsByCatalog(catalogId);
    if (records.length === 0) return;

    // Per-catalog skip: prevents redundant re-embedding within same process
    if (this.embeddedCatalogs.has(catalogId)) {
      this.logger.info("Ingestion: vector index up to date, skipping embed", {
        catalogId,
        records: records.length,
      });
      return;
    }

    const start = Date.now();
    const texts = records.map(buildDocument);
    this.logger.info("Ingestion: generating embeddings", {
      catalogId,
      count: texts.length,
    });

    const vectors = await this.embedder.embedBatch(texts);
    const items = records.map((record, i) => ({
      id: record.id,
      catalogId: record.catalogId,
      vector: vectors[i],
    }));

    await this.vectorStore.upsertAll(items);
    this.embeddedCatalogs.add(catalogId);
    this.logger.info("Ingestion: vector index updated", {
      catalogId,
      count: items.length,
      ms: Date.now() - start,
    });
  }
}
