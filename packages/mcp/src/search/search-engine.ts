import type { DatasetRecord } from "@agora/sdk";
import type { Logger } from "../logger.js";
import type { IngestionService } from "../ingestion-service.js";
import { reciprocalRankFusion } from "./rrf.js";

export type SearchMode = "fts" | "hybrid";

export interface SearchOptions {
  catalogo?: string;
  organizacion?: string;
  formato?: string;
  tags?: string[];
  limite?: number;
}

export interface SearchResult {
  dataset: DatasetRecord;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  searchMode: SearchMode;
}

/**
 * Hybrid search engine coordinating FTS + Vector + RRF.
 * Degrades gracefully to FTS-only when embeddings are unavailable.
 */
export class HybridSearchEngine {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly logger: Logger,
  ) {}

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResponse> {
    const limit = options.limite ?? 10;
    // Over-fetch to have enough after post-filtering
    const fetchLimit = limit * 3;

    const catalogIds = options.catalogo
      ? [options.catalogo]
      : this.ingestion.getCatalogIds();

    const embedder = this.ingestion.getEmbedder();
    const vectorStore = this.ingestion.getVectorStore();
    const vectorReady =
      !!embedder && !!vectorStore && (await vectorStore.itemCount()) > 0;

    // Collect fused results across all catalogs
    const allScores = new Map<string, number>();

    for (const catalogId of catalogIds) {
      const ftsIndex = this.ingestion.getFtsIndex(catalogId);
      if (!ftsIndex?.isReady()) continue;

      // FTS search
      const ftsResults = await ftsIndex.search(query, fetchLimit);

      if (vectorReady) {
        // Semantic search
        const queryVector = await embedder!.embed(query);
        const semanticResults = await vectorStore!.query(
          queryVector,
          fetchLimit,
          catalogId,
        );

        // RRF fusion
        const fused = reciprocalRankFusion(
          semanticResults.map((r) => ({ id: r.id, score: r.score })),
          ftsResults,
        );
        for (const item of fused) {
          allScores.set(
            item.id,
            Math.max(allScores.get(item.id) ?? 0, item.score),
          );
        }
      } else {
        for (const item of ftsResults) {
          allScores.set(
            item.id,
            Math.max(allScores.get(item.id) ?? 0, item.score),
          );
        }
      }
    }

    // Sort by score descending
    const ranked = [...allScores.entries()]
      .sort(([, a], [, b]) => b - a);

    // Resolve to DatasetRecords and apply post-filters
    const results: SearchResult[] = [];
    for (const [id, score] of ranked) {
      if (results.length >= limit) break;

      const dataset = this.ingestion.getDataset(id);
      if (!dataset) continue;

      if (options.organizacion && !matchesOrganization(dataset, options.organizacion)) continue;
      if (options.formato && !hasFormat(dataset, options.formato)) continue;
      if (options.tags && !matchesTags(dataset, options.tags)) continue;

      results.push({ dataset, score });
    }

    const searchMode: SearchMode = vectorReady ? "hybrid" : "fts";

    this.logger.debug("Search completed", {
      query,
      searchMode,
      candidates: allScores.size,
      returned: results.length,
    });

    return { results, searchMode };
  }
}

/** Case-insensitive substring match on organization. */
function matchesOrganization(dataset: DatasetRecord, filter: string): boolean {
  if (!dataset.organization) return false;
  return dataset.organization.toLowerCase().includes(filter.toLowerCase());
}

/** Check if any resource matches the format (case-insensitive). */
function hasFormat(dataset: DatasetRecord, format: string): boolean {
  const f = format.toLowerCase();
  return dataset.resources.some((r) => r.format.toLowerCase() === f);
}

/** Check if the dataset has ALL specified tags (case-insensitive). */
function matchesTags(dataset: DatasetRecord, tags: string[]): boolean {
  const datasetTags = new Set(dataset.tags.map((t) => t.toLowerCase()));
  return tags.every((t) => datasetTags.has(t.toLowerCase()));
}
