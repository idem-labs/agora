import jschardet from "jschardet";

export interface EncodingResult {
  /** Detected encoding name (e.g. "UTF-8", "ISO-8859-1", "windows-1252") */
  encoding: string;
  /** Detection confidence 0-1 */
  confidence: number;
}

/**
 * Detect the encoding of a raw buffer using jschardet.
 * Falls back to UTF-8 if detection confidence is too low.
 */
export function detectEncoding(buffer: Buffer): EncodingResult {
  const result = jschardet.detect(buffer);
  if (!result.encoding || result.confidence < 0.5) {
    return { encoding: "UTF-8", confidence: 0 };
  }
  return { encoding: result.encoding, confidence: result.confidence };
}

/**
 * Decode a buffer to a UTF-8 string, auto-detecting the source encoding.
 * Returns the decoded text and the detected encoding.
 */
export function decodeBuffer(buffer: Buffer): {
  text: string;
  encoding: string;
} {
  const { encoding } = detectEncoding(buffer);

  // Node TextDecoder labels — map common jschardet names
  const label = normalizeEncodingLabel(encoding);

  try {
    const decoder = new TextDecoder(label, { fatal: false });
    return { text: decoder.decode(buffer), encoding };
  } catch {
    // Ultimate fallback: latin-1 decodes any byte sequence
    const decoder = new TextDecoder("latin1", { fatal: false });
    return { text: decoder.decode(buffer), encoding: "latin1" };
  }
}

/** Map jschardet encoding names to WHATWG TextDecoder labels. */
function normalizeEncodingLabel(encoding: string): string {
  const upper = encoding.toUpperCase();
  const map: Record<string, string> = {
    "ASCII": "utf-8",
    "UTF-8": "utf-8",
    "UTF-16LE": "utf-16le",
    "UTF-16BE": "utf-16be",
    "ISO-8859-1": "latin1",
    "ISO-8859-2": "iso-8859-2",
    "ISO-8859-15": "iso-8859-15",
    "WINDOWS-1252": "windows-1252",
    "WINDOWS-1250": "windows-1250",
    "WINDOWS-1251": "windows-1251",
    "WINDOWS-1256": "windows-1256",
    "MACROMAN": "macintosh",
    "IBM866": "ibm866",
    "KOI8-R": "koi8-r",
    "SHIFT_JIS": "shift_jis",
    "EUC-JP": "euc-jp",
    "GB2312": "gb18030",
    "BIG5": "big5",
  };
  return map[upper] ?? encoding.toLowerCase();
}
