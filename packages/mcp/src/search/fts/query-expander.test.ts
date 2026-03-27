import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  expandAcronyms,
  expandSynonyms,
  expandQuery,
  getStemmer,
  type LanguagePack,
  type AcronymPack,
} from "./query-expander.js";

const spanishPack: LanguagePack = {
  stemmer: "spanish",
  synonyms: {
    presupuesto: ["gasto", "erogaciones", "partidas"],
    empleo: ["trabajo", "ocupación"],
    educación: ["escolar", "universitario"],
  },
};

const argentinaAcronyms: AcronymPack = {
  acronyms: {
    INDEC: "Instituto Nacional de Estadística y Censos",
    BCRA: "Banco Central de la República Argentina",
  },
};

describe("normalizeQuery", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeQuery("Presupuesto INDEC")).toBe("presupuesto indec");
  });

  it("handles accented characters", () => {
    expect(normalizeQuery("Educación Pública")).toBe("educacion publica");
  });

  it("trims whitespace", () => {
    expect(normalizeQuery("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(normalizeQuery("")).toBe("");
  });
});

describe("expandAcronyms", () => {
  it("expands known acronyms", () => {
    const result = expandAcronyms("indec", argentinaAcronyms);
    expect(result).toContain("indec");
    expect(result).toContain("instituto");
    expect(result).toContain("nacional");
    expect(result).toContain("estadistica");
    expect(result).toContain("censos");
  });

  it("preserves non-acronym tokens", () => {
    const result = expandAcronyms("datos abiertos", argentinaAcronyms);
    expect(result).toBe("datos abiertos");
  });

  it("handles undefined pack", () => {
    expect(expandAcronyms("indec", undefined)).toBe("indec");
  });

  it("filters out short words from expansion", () => {
    const result = expandAcronyms("indec", argentinaAcronyms);
    // "de" and "y" (length <= 2) should be filtered out
    expect(result).not.toContain(" de ");
  });
});

describe("expandSynonyms", () => {
  it("expands known synonyms", () => {
    const result = expandSynonyms("presupuesto", spanishPack);
    expect(result).toContain("presupuesto");
    expect(result).toContain("gasto");
    expect(result).toContain("erogaciones");
    expect(result).toContain("partidas");
  });

  it("handles accented synonym keys", () => {
    const result = expandSynonyms("educacion", spanishPack);
    expect(result).toContain("educacion");
    expect(result).toContain("escolar");
    expect(result).toContain("universitario");
  });

  it("preserves unrecognized tokens", () => {
    // expandSynonyms receives already-normalized text (from normalizeQuery)
    const result = expandSynonyms("inflacion datos", spanishPack);
    expect(result).toContain("inflacion");
    expect(result).toContain("datos");
  });

  it("handles undefined pack", () => {
    expect(expandSynonyms("presupuesto", undefined)).toBe("presupuesto");
  });
});

describe("expandQuery", () => {
  it("full pipeline: normalize + acronyms + synonyms", () => {
    const result = expandQuery(
      "Presupuesto INDEC",
      spanishPack,
      argentinaAcronyms,
    );
    // Should contain the original terms (normalized)
    expect(result).toContain("presupuesto");
    expect(result).toContain("indec");
    // Should contain synonym expansions
    expect(result).toContain("gasto");
    expect(result).toContain("erogaciones");
    // Should contain acronym expansions
    expect(result).toContain("instituto");
    expect(result).toContain("censos");
  });

  it("deduplicates tokens", () => {
    const result = expandQuery("empleo empleo", spanishPack, undefined);
    const tokens = result.split(" ");
    const unique = new Set(tokens);
    expect(tokens.length).toBe(unique.size);
  });

  it("works with no packs", () => {
    const result = expandQuery("hello world", undefined, undefined);
    expect(result).toBe("hello world");
  });
});

describe("getStemmer", () => {
  it("maps known language codes", () => {
    expect(getStemmer("es")).toBe("spanish");
    expect(getStemmer("en")).toBe("english");
    expect(getStemmer("pt")).toBe("portuguese");
    expect(getStemmer("fr")).toBe("french");
  });

  it("returns 'none' for unknown languages", () => {
    expect(getStemmer("xx")).toBe("none");
  });
});
