import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { DatasetRecord } from "@agora/sdk";
import { quotedString } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import { connectDatabase } from "../../duckdb.js";
import type { Logger } from "../../logger.js";
import {
  expandQuery,
  getStemmer,
  loadLanguagePack,
  loadAcronymPack,
  type LanguagePack,
  type AcronymPack,
} from "./query-expander.js";

export interface FtsResult {
  id: string;
  score: number;
}

/** Field weights for multi-field BM25 scoring. */
const FIELD_WEIGHTS = {
  title: 3.0,
  tags: 2.5,
  organization: 2.0,
  description: 1.0,
} as const;

/**
 * DuckDB FTS index for a single catalog.
 * One DuckDB database file per catalog, with language-specific stemmer.
 */
export class DuckDbFtsIndex {
  private conn: DuckDBConnection | null = null;
  private count = 0;
  private langPack: LanguagePack | undefined;
  private acronymPack: AcronymPack | undefined;

  constructor(
    private readonly catalogId: string,
    private readonly language: string,
    private readonly country: string,
    private readonly baseDir: string,
    private readonly logger: Logger,
  ) {}

  /** Build (or rebuild) the FTS index from dataset records. */
  async build(records: DatasetRecord[]): Promise<void> {
    const start = Date.now();
    const dbPath = await this.getDbPath();
    this.conn = await connectDatabase(dbPath);

    // Load language packs
    [this.langPack, this.acronymPack] = await Promise.all([
      loadLanguagePack(this.language),
      loadAcronymPack(this.country),
    ]);

    await this.conn.run("INSTALL fts");
    await this.conn.run("LOAD fts");

    // Drop and recreate table for clean rebuild
    await this.conn.run("DROP TABLE IF EXISTS datasets");
    await this.conn.run(`
      CREATE TABLE datasets (
        id VARCHAR PRIMARY KEY,
        catalog_id VARCHAR,
        title VARCHAR,
        description VARCHAR,
        organization VARCHAR,
        tags VARCHAR
      )
    `);

    // Bulk insert using appender
    if (records.length > 0) {
      const appender = await this.conn.createAppender("datasets");
      for (const record of records) {
        appender.appendVarchar(record.id);
        appender.appendVarchar(record.catalogId);
        appender.appendVarchar(record.title ?? "");
        appender.appendVarchar(record.description ?? "");
        appender.appendVarchar(record.organization ?? "");
        appender.appendVarchar((record.tags ?? []).join(" "));
        appender.endRow();
      }
      appender.flushSync();
      appender.closeSync();
    }

    // Create FTS index with language-specific stemmer
    const stemmer = getStemmer(this.language);
    await this.conn.run(`
      PRAGMA create_fts_index(
        'datasets', 'id',
        'title', 'description', 'organization', 'tags',
        stemmer = '${stemmer}',
        stopwords = 'none',
        strip_accents = 1,
        lower = 1,
        overwrite = 1
      )
    `);

    this.count = records.length;

    this.logger.info("FTS index built", {
      catalogId: this.catalogId,
      stemmer,
      records: this.count,
      ms: Date.now() - start,
    });
  }

  /**
   * Search with weighted multi-field BM25 scoring + query expansion.
   * Falls back to LIKE search if BM25 returns no results.
   */
  async search(query: string, limit: number = 20): Promise<FtsResult[]> {
    if (!this.conn || this.count === 0) return [];

    const expanded = expandQuery(query, this.langPack, this.acronymPack);
    const safeQuery = quotedString(expanded);

    // Weighted multi-field BM25 scoring
    const sql = `
      SELECT id, score FROM (
        SELECT id,
          COALESCE(fts_main_datasets.match_bm25(id, ${safeQuery}, fields := 'title'), 0) * ${FIELD_WEIGHTS.title}
          + COALESCE(fts_main_datasets.match_bm25(id, ${safeQuery}, fields := 'tags'), 0) * ${FIELD_WEIGHTS.tags}
          + COALESCE(fts_main_datasets.match_bm25(id, ${safeQuery}, fields := 'organization'), 0) * ${FIELD_WEIGHTS.organization}
          + COALESCE(fts_main_datasets.match_bm25(id, ${safeQuery}, fields := 'description'), 0) * ${FIELD_WEIGHTS.description}
          AS score
        FROM datasets
      ) scored
      WHERE score > 0
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    try {
      const reader = await this.conn.runAndReadAll(sql);
      const rows = reader.getRowObjectsJson();
      if (rows.length > 0) {
        return rows.map((row) => ({
          id: row["id"] as string,
          score: row["score"] as number,
        }));
      }
    } catch (error) {
      this.logger.warn("FTS BM25 search failed, trying LIKE fallback", {
        catalogId: this.catalogId,
        error: String(error),
      });
    }

    // Fallback: LIKE search on normalized query terms
    return this.likeFallback(query, limit);
  }

  /** Number of indexed documents. */
  itemCount(): number {
    return this.count;
  }

  /** Whether the index has been built and is ready. */
  isReady(): boolean {
    return this.conn !== null && this.count > 0;
  }

  private async likeFallback(
    query: string,
    limit: number,
  ): Promise<FtsResult[]> {
    if (!this.conn) return [];

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (terms.length === 0) return [];

    // Build LIKE conditions for each term across all text fields
    const conditions = terms.map((term) => {
      const safe = quotedString(`%${term}%`);
      return `(LOWER(title) LIKE ${safe} OR LOWER(description) LIKE ${safe} OR LOWER(organization) LIKE ${safe} OR LOWER(tags) LIKE ${safe})`;
    });

    const sql = `
      SELECT id, ${terms.length}.0 AS score
      FROM datasets
      WHERE ${conditions.join(" OR ")}
      LIMIT ${limit}
    `;

    try {
      const reader = await this.conn.runAndReadAll(sql);
      return reader.getRowObjectsJson().map((row) => ({
        id: row["id"] as string,
        score: row["score"] as number,
      }));
    } catch {
      return [];
    }
  }

  private async getDbPath(): Promise<string> {
    const dir = join(this.baseDir, "indexes", "fts");
    await mkdir(dir, { recursive: true });
    return join(dir, `${this.catalogId}.duckdb`);
  }
}
