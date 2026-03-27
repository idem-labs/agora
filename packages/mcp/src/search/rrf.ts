/**
 * Reciprocal Rank Fusion (RRF) — merges two ranked result lists into one.
 *
 * Formula: score(d) = wSemantic/(k + rankSemantic) + wLexical/(k + rankLexical)
 * Default weights: 0.6 semantic, 0.4 lexical, k=60.
 *
 * If only one list is provided, returns that list re-scored with its weight.
 */

export interface RankedItem {
  id: string;
  score: number;
}

export interface RrfOptions {
  /** Weight for semantic (vector) results. Default: 0.6 */
  semanticWeight?: number;
  /** Weight for lexical (FTS) results. Default: 0.4 */
  lexicalWeight?: number;
  /** RRF constant k. Default: 60 */
  k?: number;
}

const DEFAULT_SEMANTIC_WEIGHT = 0.6;
const DEFAULT_LEXICAL_WEIGHT = 0.4;
const DEFAULT_K = 60;

/**
 * Fuse two ranked lists using Reciprocal Rank Fusion.
 *
 * @param semanticResults - Results from vector/semantic search (sorted by score desc)
 * @param lexicalResults  - Results from FTS/lexical search (sorted by score desc)
 * @param options         - Weights and k constant
 * @returns Fused list sorted by combined RRF score, descending
 */
export function reciprocalRankFusion(
  semanticResults: RankedItem[],
  lexicalResults: RankedItem[],
  options?: RrfOptions,
): RankedItem[] {
  const wSemantic = options?.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT;
  const wLexical = options?.lexicalWeight ?? DEFAULT_LEXICAL_WEIGHT;
  const k = options?.k ?? DEFAULT_K;

  const scores = new Map<string, number>();

  // Semantic contributions (rank is 1-based)
  for (let i = 0; i < semanticResults.length; i++) {
    const id = semanticResults[i].id;
    const rrfScore = wSemantic / (k + i + 1);
    scores.set(id, (scores.get(id) ?? 0) + rrfScore);
  }

  // Lexical contributions (rank is 1-based)
  for (let i = 0; i < lexicalResults.length; i++) {
    const id = lexicalResults[i].id;
    const rrfScore = wLexical / (k + i + 1);
    scores.set(id, (scores.get(id) ?? 0) + rrfScore);
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
