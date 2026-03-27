import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IngestionService } from "./ingestion-service.js";
import type { CatalogRegistry } from "./catalogs/catalog-registry.js";
import type { CatalogAdapter } from "./catalogs/adapter.js";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type { Catalog, DatasetRecord } from "@agora/sdk";
import type { Embedder } from "./search/semantic/embedder.js";
import type { VectorStore } from "./search/semantic/vector-store.js";

const noop = () => {};
const logger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

const catalog: Catalog = {
  id: "test-catalog",
  name: "Test Catalog",
  url: "https://test.example.com",
  type: "ckan",
  enabled: true,
};

const records: DatasetRecord[] = [
  {
    id: "test-catalog:dataset-a",
    catalogId: "test-catalog",
    externalId: "dataset-a",
    title: "Dataset A",
    tags: ["tag1"],
    resources: [],
  },
  {
    id: "test-catalog:dataset-b",
    catalogId: "test-catalog",
    externalId: "dataset-b",
    title: "Dataset B",
    tags: [],
    resources: [],
  },
];

function createMockAdapter(datasets: DatasetRecord[]): CatalogAdapter {
  return {
    catalog,
    async *listDatasets() {
      for (const d of datasets) yield d;
    },
    async getDataset(externalId: string) {
      return datasets.find((d) => d.externalId === externalId) ?? null;
    },
  };
}

function createMockRegistry(adapter: CatalogAdapter): CatalogRegistry {
  return {
    get: (id: string) => (id === catalog.id ? adapter : undefined),
    list: () => [catalog],
    listAdapters: () => [adapter],
  } as CatalogRegistry;
}

describe("IngestionService", () => {
  let dataDir: string;
  let config: Config;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "agora-ingestion-"));
    config = {
      dataDir,
      cacheDir: join(dataDir, "cache"),
      logLevel: "error",
      metadataTtlHours: 24,
      presets: [],
      catalogIds: ["test-catalog"],
      embeddingBatchSize: 64,
      queryTimeoutMs: 60_000,
      maxFileSizeBytes: 200 * 1024 * 1024,
    };
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("fetches and indexes datasets on first run", async () => {
    const adapter = createMockAdapter(records);
    const registry = createMockRegistry(adapter);
    const service = new IngestionService(registry, config, logger);

    await service.initialize();

    expect(service.totalCount).toBe(2);
    expect(service.getDataset("test-catalog:dataset-a")?.title).toBe(
      "Dataset A",
    );
    expect(service.getDataset("test-catalog:dataset-b")?.title).toBe(
      "Dataset B",
    );
  });

  it("loads from cache on second run", async () => {
    const adapter = createMockAdapter(records);
    const registry = createMockRegistry(adapter);

    // First run: fetches and caches
    const service1 = new IngestionService(registry, config, logger);
    await service1.initialize();

    // Second run: should load from cache, not call adapter
    const spyAdapter = createMockAdapter([]);
    const listSpy = vi.spyOn(spyAdapter, "listDatasets");
    const registry2 = createMockRegistry(spyAdapter);
    const service2 = new IngestionService(registry2, config, logger);
    await service2.initialize();

    expect(listSpy).not.toHaveBeenCalled();
    expect(service2.totalCount).toBe(2);
  });

  it("re-fetches when cache is stale (TTL=0)", async () => {
    const adapter = createMockAdapter(records);
    const registry = createMockRegistry(adapter);

    // First run: populate cache
    const service1 = new IngestionService(registry, config, logger);
    await service1.initialize();

    // Second run with TTL=0: should re-fetch
    const newRecords: DatasetRecord[] = [
      {
        id: "test-catalog:dataset-c",
        catalogId: "test-catalog",
        externalId: "dataset-c",
        title: "Dataset C",
        tags: [],
        resources: [],
      },
    ];
    const freshAdapter = createMockAdapter(newRecords);
    const registry2 = createMockRegistry(freshAdapter);
    const service2 = new IngestionService(
      registry2,
      { ...config, metadataTtlHours: 0 },
      logger,
    );
    await service2.initialize();

    expect(service2.totalCount).toBe(1);
    expect(service2.getDataset("test-catalog:dataset-c")?.title).toBe(
      "Dataset C",
    );
  });

  it("returns undefined for unknown dataset ID", async () => {
    const adapter = createMockAdapter(records);
    const registry = createMockRegistry(adapter);
    const service = new IngestionService(registry, config, logger);
    await service.initialize();

    expect(service.getDataset("unknown:id")).toBeUndefined();
    expect(service.getDataset("no-colon")).toBeUndefined();
  });

  it("returns datasets by catalog", async () => {
    const adapter = createMockAdapter(records);
    const registry = createMockRegistry(adapter);
    const service = new IngestionService(registry, config, logger);
    await service.initialize();

    const byCatalog = service.getDatasetsByCatalog("test-catalog");
    expect(byCatalog).toHaveLength(2);

    const empty = service.getDatasetsByCatalog("nonexistent");
    expect(empty).toEqual([]);
  });

  describe("with embedder + vector store", () => {
    function createMockEmbedder(): Embedder {
      return {
        dimensions: () => 4,
        embed: vi.fn(async () => [0.1, 0.2, 0.3, 0.4]),
        embedBatch: vi.fn(async (texts: string[]) =>
          texts.map((_, i) => [i * 0.1, 0.2, 0.3, 0.4]),
        ),
      };
    }

    function createMockVectorStore(count = 0): VectorStore {
      return {
        initialize: vi.fn(async () => {}),
        upsertAll: vi.fn(async () => {}),
        query: vi.fn(async () => []),
        itemCount: vi.fn(async () => count),
      };
    }

    it("calls embedBatch and upsertAll via embedInBackground", async () => {
      const adapter = createMockAdapter(records);
      const registry = createMockRegistry(adapter);
      const embedder = createMockEmbedder();
      const vectorStore = createMockVectorStore();

      const service = new IngestionService(
        registry,
        config,
        logger,
        undefined,
        embedder,
        vectorStore,
      );
      await service.initialize();

      // Embedding doesn't happen during initialize anymore
      expect(embedder.embedBatch).not.toHaveBeenCalled();

      // It happens via embedInBackground
      await service.embedInBackground();

      expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
      expect(vectorStore.upsertAll).toHaveBeenCalledTimes(1);

      const upsertArg = (vectorStore.upsertAll as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      expect(upsertArg).toHaveLength(2);
      expect(upsertArg[0].id).toBe("test-catalog:dataset-a");
    });

    it("re-embeds on fresh process start even with cache hit", async () => {
      const adapter = createMockAdapter(records);
      const registry = createMockRegistry(adapter);

      // First run: populate cache
      const service1 = new IngestionService(registry, config, logger);
      await service1.initialize();

      // Second run (new process): re-embeds because per-catalog tracking resets
      const embedder = createMockEmbedder();
      const vectorStore = createMockVectorStore(2);

      const registry2 = createMockRegistry(createMockAdapter([]));
      const service2 = new IngestionService(
        registry2,
        config,
        logger,
        undefined,
        embedder,
        vectorStore,
      );
      await service2.initialize();
      await service2.embedInBackground();

      // Background embedding runs (safe, non-blocking upsert is idempotent)
      expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
      expect(vectorStore.upsertAll).toHaveBeenCalledTimes(1);
    });

    it("skips re-embedding within same process after successful embed", async () => {
      const adapter = createMockAdapter(records);
      const registry = createMockRegistry(adapter);
      const embedder = createMockEmbedder();
      const vectorStore = createMockVectorStore(0);

      const service = new IngestionService(
        registry,
        config,
        logger,
        undefined,
        embedder,
        vectorStore,
      );
      await service.initialize();

      // First call: embeds
      await service.embedInBackground();
      expect(embedder.embedBatch).toHaveBeenCalledTimes(1);

      // Second call within same process: skips
      await service.embedInBackground();
      expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
    });

    it("re-embeds when cache hit but vector store is empty", async () => {
      const adapter = createMockAdapter(records);
      const registry = createMockRegistry(adapter);

      // First run: populate cache
      const service1 = new IngestionService(registry, config, logger);
      await service1.initialize();

      // Second run: cache exists but vector store is empty
      const embedder = createMockEmbedder();
      const vectorStore = createMockVectorStore(0);

      const registry2 = createMockRegistry(createMockAdapter([]));
      const service2 = new IngestionService(
        registry2,
        config,
        logger,
        undefined,
        embedder,
        vectorStore,
      );
      await service2.initialize();
      await service2.embedInBackground();

      expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
      expect(vectorStore.upsertAll).toHaveBeenCalledTimes(1);
    });

    it("embeds all catalogs in multi-catalog setup (no skip bug)", async () => {
      const catalog2: Catalog = {
        id: "catalog-2",
        name: "Catalog 2",
        url: "https://test2.example.com",
        type: "ckan",
        enabled: true,
      };
      const records2: DatasetRecord[] = [
        {
          id: "catalog-2:dataset-x",
          catalogId: "catalog-2",
          externalId: "dataset-x",
          title: "Dataset X",
          tags: [],
          resources: [],
        },
      ];

      const adapter1 = createMockAdapter(records);
      const adapter2: CatalogAdapter = {
        catalog: catalog2,
        async *listDatasets() {
          for (const d of records2) yield d;
        },
        async getDataset(externalId: string) {
          return records2.find((d) => d.externalId === externalId) ?? null;
        },
      };

      const multiRegistry = {
        get: (id: string) => {
          if (id === catalog.id) return adapter1;
          if (id === catalog2.id) return adapter2;
          return undefined;
        },
        list: () => [catalog, catalog2],
        listAdapters: () => [adapter1, adapter2],
      } as CatalogRegistry;

      const embedder = createMockEmbedder();
      const vectorStore = createMockVectorStore(0);

      const service = new IngestionService(
        multiRegistry,
        config,
        logger,
        undefined,
        embedder,
        vectorStore,
      );
      await service.initialize();
      await service.embedInBackground();

      // Both catalogs should be embedded
      expect(embedder.embedBatch).toHaveBeenCalledTimes(2);
      expect(vectorStore.upsertAll).toHaveBeenCalledTimes(2);
    });

    it("works without embedder (backward compat)", async () => {
      const adapter = createMockAdapter(records);
      const registry = createMockRegistry(adapter);
      const service = new IngestionService(registry, config, logger);
      await service.initialize();

      expect(service.totalCount).toBe(2);
      expect(service.getEmbedder()).toBeUndefined();
      expect(service.getVectorStore()).toBeUndefined();
    });
  });
});
