import { LocalIndex } from "vectra";
import type { Logger } from "../../logger.js";

export interface VectorStoreItem {
  id: string;
  catalogId: string;
  score: number;
}

export interface VectorStore {
  initialize(): Promise<void>;
  upsertAll(
    items: Array<{ id: string; catalogId: string; vector: number[] }>,
  ): Promise<void>;
  query(
    vector: number[],
    topK: number,
    catalogId?: string,
  ): Promise<VectorStoreItem[]>;
  itemCount(): Promise<number>;
}

/**
 * Vector store backed by Vectra (pure-JS local index).
 * Persists to `indexPath/index.json` automatically.
 */
export class VectraVectorStore implements VectorStore {
  private readonly index: LocalIndex;

  constructor(
    private readonly indexPath: string,
    private readonly logger: Logger,
  ) {
    this.index = new LocalIndex(indexPath);
  }

  async initialize(): Promise<void> {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({
        version: 1,
        metadata_config: { indexed: ["catalogId"] },
      });
      this.logger.info("VectorStore: created new index", {
        path: this.indexPath,
      });
    } else {
      this.logger.info("VectorStore: loaded existing index", {
        path: this.indexPath,
      });
    }
  }

  async upsertAll(
    items: Array<{ id: string; catalogId: string; vector: number[] }>,
  ): Promise<void> {
    if (items.length === 0) return;

    await this.index.beginUpdate();
    try {
      for (const item of items) {
        await this.index.upsertItem({
          id: item.id,
          vector: item.vector,
          metadata: { id: item.id, catalogId: item.catalogId },
        });
      }
      await this.index.endUpdate();
      this.logger.info("VectorStore: upserted items", {
        count: items.length,
      });
    } catch (error) {
      await this.index.cancelUpdate();
      throw error;
    }
  }

  async query(
    vector: number[],
    topK: number,
    catalogId?: string,
  ): Promise<VectorStoreItem[]> {
    const filter = catalogId
      ? { catalogId: { $eq: catalogId } }
      : undefined;

    const results = await this.index.queryItems(vector, "", topK, filter);
    return results.map((r) => ({
      id: r.item.metadata.id as string,
      catalogId: r.item.metadata.catalogId as string,
      score: r.score,
    }));
  }

  async itemCount(): Promise<number> {
    const items = await this.index.listItems();
    return items.length;
  }
}
