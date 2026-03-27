import { describe, it, expect, vi } from "vitest";
import { HybridSearchEngine } from "./search-engine.js";
import type { IngestionService } from "../ingestion-service.js";
import type { DuckDbFtsIndex, FtsResult } from "./fts/fts-index.js";
import type { Embedder } from "./semantic/embedder.js";
import type { VectorStore, VectorStoreItem } from "./semantic/vector-store.js";
import type { DatasetRecord } from "@agora/sdk";
import type { Logger } from "../logger.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

// --- Test fixtures ---

const datasets: DatasetRecord[] = [
  {
    id: "cat:presupuesto-2024",
    catalogId: "cat",
    externalId: "presupuesto-2024",
    title: "Presupuesto Nacional 2024",
    description: "Datos del presupuesto de gastos",
    organization: "Ministerio de Economía",
    tags: ["presupuesto", "gasto público"],
    resources: [
      { id: "r1", datasetId: "cat:presupuesto-2024", url: "https://x.com/a.csv", format: "CSV" },
    ],
  },
  {
    id: "cat:empleo-registrado",
    catalogId: "cat",
    externalId: "empleo-registrado",
    title: "Empleo registrado",
    description: "Estadísticas de empleo",
    organization: "Ministerio de Trabajo",
    tags: ["empleo", "trabajo"],
    resources: [
      { id: "r2", datasetId: "cat:empleo-registrado", url: "https://x.com/b.json", format: "JSON" },
    ],
  },
  {
    id: "cat:censo-2022",
    catalogId: "cat",
    externalId: "censo-2022",
    title: "Censo Nacional 2022",
    description: "Resultados del censo",
    organization: "INDEC",
    tags: ["censo", "población"],
    resources: [
      { id: "r3", datasetId: "cat:censo-2022", url: "https://x.com/c.csv", format: "CSV" },
      { id: "r4", datasetId: "cat:censo-2022", url: "https://x.com/c.xlsx", format: "XLSX" },
    ],
  },
];

const datasetMap = new Map(datasets.map((d) => [d.id, d]));

// --- Mocks ---

function createMockFtsIndex(results: FtsResult[]): DuckDbFtsIndex {
  return {
    search: vi.fn(async () => results),
    isReady: vi.fn(() => true),
    itemCount: vi.fn(() => datasets.length),
    build: vi.fn(async () => {}),
  } as unknown as DuckDbFtsIndex;
}

function createMockEmbedder(): Embedder {
  return {
    embed: vi.fn(async () => new Array(384).fill(0.1)),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => new Array(384).fill(0.1)),
    ),
    dimensions: vi.fn(() => 384),
  };
}

function createMockVectorStore(
  results: VectorStoreItem[],
  count: number,
): VectorStore {
  return {
    query: vi.fn(async () => results),
    itemCount: vi.fn(async () => count),
    initialize: vi.fn(async () => {}),
    upsertAll: vi.fn(async () => {}),
  };
}

function createMockIngestion(opts: {
  ftsResults?: FtsResult[];
  vectorResults?: VectorStoreItem[];
  vectorCount?: number;
  withEmbedder?: boolean;
}): IngestionService {
  const ftsIndex = createMockFtsIndex(opts.ftsResults ?? []);
  const embedder = opts.withEmbedder !== false ? createMockEmbedder() : undefined;
  const vectorStore = opts.vectorCount != null
    ? createMockVectorStore(opts.vectorResults ?? [], opts.vectorCount)
    : undefined;

  return {
    getCatalogIds: vi.fn(() => ["cat"]),
    getFtsIndex: vi.fn(() => ftsIndex),
    getEmbedder: vi.fn(() => embedder),
    getVectorStore: vi.fn(() => vectorStore),
    getDataset: vi.fn((id: string) => datasetMap.get(id)),
    getDatasetsByCatalog: vi.fn(() => datasets),
    get totalCount() { return datasets.length; },
  } as unknown as IngestionService;
}

// --- Tests ---

describe("HybridSearchEngine", () => {
  describe("FTS-only mode", () => {
    it("searches with FTS when vector store has no items", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 3.0 },
        ],
        vectorCount: 0, // embeddings not ready
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("presupuesto");

      expect(response.searchMode).toBe("fts");
      expect(response.results).toHaveLength(2);
      expect(response.results[0].dataset.id).toBe("cat:presupuesto-2024");
    });

    it("searches with FTS when no embedder configured", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [{ id: "cat:censo-2022", score: 4.0 }],
        withEmbedder: false,
        vectorCount: undefined,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("censo");

      expect(response.searchMode).toBe("fts");
      expect(response.results).toHaveLength(1);
    });

    it("returns empty results when no matches", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("nonexistent");

      expect(response.results).toHaveLength(0);
      expect(response.searchMode).toBe("fts");
    });
  });

  describe("Hybrid mode", () => {
    it("fuses FTS and semantic results via RRF", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 3.0 },
        ],
        vectorResults: [
          { id: "cat:presupuesto-2024", catalogId: "cat", score: 0.95 },
          { id: "cat:censo-2022", catalogId: "cat", score: 0.80 },
        ],
        vectorCount: 3,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("presupuesto");

      expect(response.searchMode).toBe("hybrid");
      // presupuesto-2024 appears in both → highest RRF score
      expect(response.results[0].dataset.id).toBe("cat:presupuesto-2024");
      // All three datasets should appear
      expect(response.results).toHaveLength(3);
    });

    it("embeds the query for semantic search", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [{ id: "cat:censo-2022", score: 4.0 }],
        vectorResults: [{ id: "cat:censo-2022", catalogId: "cat", score: 0.9 }],
        vectorCount: 3,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      await engine.search("censo población");

      const embedder = ingestion.getEmbedder()!;
      expect(embedder.embed).toHaveBeenCalledWith("censo población");
    });
  });

  describe("Filters", () => {
    it("filters by organization (case-insensitive substring)", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 4.0 },
          { id: "cat:censo-2022", score: 3.0 },
        ],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos", {
        organizacion: "economía",
      });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].dataset.organization).toBe(
        "Ministerio de Economía",
      );
    });

    it("filters by format", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 4.0 },
          { id: "cat:censo-2022", score: 3.0 },
        ],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos", { formato: "json" });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].dataset.id).toBe("cat:empleo-registrado");
    });

    it("filters by tags (all must match)", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 4.0 },
        ],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos", {
        tags: ["empleo", "trabajo"],
      });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].dataset.id).toBe("cat:empleo-registrado");
    });

    it("filters by catalog", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [{ id: "cat:censo-2022", score: 4.0 }],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("censo", { catalogo: "cat" });

      expect(response.results).toHaveLength(1);
      // Should only search in the specified catalog
      expect(ingestion.getFtsIndex).toHaveBeenCalledWith("cat");
    });

    it("respects limit", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:presupuesto-2024", score: 5.0 },
          { id: "cat:empleo-registrado", score: 4.0 },
          { id: "cat:censo-2022", score: 3.0 },
        ],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos", { limite: 2 });

      expect(response.results).toHaveLength(2);
    });
  });

  describe("Edge cases", () => {
    it("skips catalogs with no ready FTS index", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [],
        vectorCount: 0,
      });
      // Override getFtsIndex to return non-ready index
      (ingestion.getFtsIndex as ReturnType<typeof vi.fn>).mockReturnValue({
        isReady: () => false,
        search: vi.fn(),
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("test");

      expect(response.results).toHaveLength(0);
    });

    it("handles dataset not found in lookup gracefully", async () => {
      const ingestion = createMockIngestion({
        ftsResults: [
          { id: "cat:missing", score: 5.0 },
          { id: "cat:censo-2022", score: 3.0 },
        ],
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos");

      // "cat:missing" skipped, only censo returned
      expect(response.results).toHaveLength(1);
      expect(response.results[0].dataset.id).toBe("cat:censo-2022");
    });

    it("default limit is 10", async () => {
      const ftsResults = Array.from({ length: 15 }, (_, i) => ({
        id: datasets[i % datasets.length].id,
        score: 15 - i,
      }));
      const ingestion = createMockIngestion({
        ftsResults,
        vectorCount: 0,
      });

      const engine = new HybridSearchEngine(ingestion, logger);
      const response = await engine.search("datos");

      expect(response.results.length).toBeLessThanOrEqual(10);
    });
  });
});
