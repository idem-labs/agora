import { describe, it, expect } from "vitest";
import { detectEncoding, decodeBuffer } from "./encoding.js";

describe("detectEncoding", () => {
  it("detects UTF-8 text", () => {
    const buffer = Buffer.from("Hola, ¿cómo estás?", "utf-8");
    const result = detectEncoding(buffer);
    expect(result.encoding).toMatch(/utf-8/i);
  });

  it("detects Latin-1 text", () => {
    // Latin-1 encoded bytes for "café"
    const buffer = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    const result = detectEncoding(buffer);
    // jschardet may detect as windows-1252 or ISO-8859-1
    expect(result.encoding).toMatch(/8859|1252|ascii/i);
  });

  it("falls back to UTF-8 for empty buffer", () => {
    const result = detectEncoding(Buffer.alloc(0));
    expect(result.encoding).toBe("UTF-8");
    expect(result.confidence).toBe(0);
  });
});

describe("decodeBuffer", () => {
  it("decodes UTF-8 buffer to string", () => {
    const text = "Presupuesto público — año 2024";
    const buffer = Buffer.from(text, "utf-8");
    const result = decodeBuffer(buffer);
    expect(result.text).toBe(text);
  });

  it("decodes buffer and returns detected encoding", () => {
    const buffer = Buffer.from("Hello world", "utf-8");
    const result = decodeBuffer(buffer);
    expect(result.text).toBe("Hello world");
    expect(result.encoding).toBeTruthy();
  });

  it("handles BOM in UTF-8", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const text = Buffer.from("datos", "utf-8");
    const buffer = Buffer.concat([bom, text]);
    const result = decodeBuffer(buffer);
    // TextDecoder strips BOM for UTF-8
    expect(result.text).toContain("datos");
  });
});
