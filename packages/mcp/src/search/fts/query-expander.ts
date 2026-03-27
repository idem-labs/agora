/**
 * Pre-search query expansion pipeline.
 * Normalizes, expands acronyms, and expands synonyms based on catalog language/country.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface LanguagePack {
  stemmer: string;
  synonyms: Record<string, string[]>;
}

export interface AcronymPack {
  acronyms: Record<string, string>;
}

/** Strip diacritics / accents from text. */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normalize query: lowercase + strip accents. */
export function normalizeQuery(query: string): string {
  return stripAccents(query.toLowerCase().trim());
}

/**
 * Expand acronyms found in the query.
 * "indec" → "indec instituto nacional estadística censos"
 */
export function expandAcronyms(
  query: string,
  acronyms: AcronymPack | undefined,
): string {
  if (!acronyms) return query;

  const tokens = query.split(/\s+/);
  const expanded: string[] = [];

  for (const token of tokens) {
    expanded.push(token);
    const upper = token.toUpperCase();
    const expansion = acronyms.acronyms[upper];
    if (expansion) {
      // Add expansion words (normalized, without stopwords)
      const words = normalizeQuery(expansion)
        .split(/\s+/)
        .filter((w) => w.length > 2);
      expanded.push(...words);
    }
  }

  return expanded.join(" ");
}

/**
 * Expand synonyms found in the query.
 * "presupuesto" → "presupuesto gasto erogaciones partidas"
 */
export function expandSynonyms(
  query: string,
  langPack: LanguagePack | undefined,
): string {
  if (!langPack) return query;

  const tokens = query.split(/\s+/);
  const expanded: string[] = [];
  const normalizedSynonyms = new Map<string, string[]>();

  // Pre-normalize synonym keys for matching
  for (const [key, values] of Object.entries(langPack.synonyms)) {
    normalizedSynonyms.set(normalizeQuery(key), values.map(normalizeQuery));
  }

  for (const token of tokens) {
    expanded.push(token);
    const synonyms = normalizedSynonyms.get(token);
    if (synonyms) {
      expanded.push(...synonyms);
    }
  }

  return expanded.join(" ");
}

/**
 * Full query expansion pipeline for a specific catalog's language/country.
 * 1. Normalize (lowercase, strip accents)
 * 2. Expand acronyms (country-specific)
 * 3. Expand synonyms (language-specific)
 */
export function expandQuery(
  query: string,
  langPack: LanguagePack | undefined,
  acronymPack: AcronymPack | undefined,
): string {
  let expanded = normalizeQuery(query);
  expanded = expandAcronyms(expanded, acronymPack);
  expanded = expandSynonyms(expanded, langPack);
  // Deduplicate tokens while preserving order
  const seen = new Set<string>();
  const unique = expanded.split(/\s+/).filter((t) => {
    if (t.length === 0 || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  return unique.join(" ");
}

// --- Language pack loading ---

const langPackCache = new Map<string, LanguagePack | null>();
const acronymPackCache = new Map<string, AcronymPack | null>();

/** Load a language pack by language code (e.g., "es"). Returns undefined if not found. */
export async function loadLanguagePack(
  language: string,
): Promise<LanguagePack | undefined> {
  if (langPackCache.has(language)) {
    return langPackCache.get(language) ?? undefined;
  }
  try {
    const path = join(__dirname, "lang", `${language}.json`);
    const data = await readFile(path, "utf-8");
    const pack = JSON.parse(data) as LanguagePack;
    langPackCache.set(language, pack);
    return pack;
  } catch {
    langPackCache.set(language, null);
    return undefined;
  }
}

/** Load an acronym pack by country code (e.g., "AR"). Returns undefined if not found. */
export async function loadAcronymPack(
  country: string,
): Promise<AcronymPack | undefined> {
  if (acronymPackCache.has(country)) {
    return acronymPackCache.get(country) ?? undefined;
  }
  try {
    const path = join(__dirname, "acronyms", `${country}.json`);
    const data = await readFile(path, "utf-8");
    const pack = JSON.parse(data) as AcronymPack;
    acronymPackCache.set(country, pack);
    return pack;
  } catch {
    acronymPackCache.set(country, null);
    return undefined;
  }
}

/** Map language code to DuckDB FTS stemmer name. */
export function getStemmer(language: string): string {
  const map: Record<string, string> = {
    es: "spanish",
    en: "english",
    pt: "portuguese",
    fr: "french",
    de: "german",
    it: "italian",
    nl: "dutch",
    ca: "catalan",
  };
  return map[language] ?? "none";
}
