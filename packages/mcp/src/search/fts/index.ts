export { DuckDbFtsIndex, type FtsResult } from "./fts-index.js";
export {
  expandQuery,
  normalizeQuery,
  expandAcronyms,
  expandSynonyms,
  getStemmer,
  loadLanguagePack,
  loadAcronymPack,
  type LanguagePack,
  type AcronymPack,
} from "./query-expander.js";
