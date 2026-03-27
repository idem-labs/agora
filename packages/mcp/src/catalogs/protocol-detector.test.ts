import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectProtocol } from "./protocol-detector.js";
import type { Logger } from "../logger.js";

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("detectProtocol", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("detects CKAN protocol", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/3/action/package_search")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({
              success: true,
              result: { count: 100, results: [{ name: "test" }] },
            }),
        });
      }
      // Socrata probe fails
      return Promise.resolve({ ok: false, status: 404 });
    }) as typeof fetch;

    const result = await detectProtocol(
      "https://datos.gob.ar",
      mockLogger,
      5000,
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("ckan");
  });

  it("detects Socrata protocol", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/catalog/v1")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({
              results: [
                {
                  resource: { id: "abc", name: "Test" },
                  classification: {},
                  metadata: { domain: "example.com" },
                },
              ],
              resultSetSize: 1000,
            }),
        });
      }
      // CKAN probe fails
      return Promise.resolve({ ok: false, status: 404 });
    }) as typeof fetch;

    const result = await detectProtocol(
      "https://www.datos.gov.co",
      mockLogger,
      5000,
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("socrata");
  });

  it("returns null when no protocol matches", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;

    const result = await detectProtocol(
      "https://unknown-portal.com",
      mockLogger,
      5000,
    );

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "No protocol detected",
      expect.objectContaining({ url: "https://unknown-portal.com" }),
    );
  });

  it("prefers CKAN when both probes succeed", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/3/action/package_search")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({
              success: true,
              result: { count: 10, results: [] },
            }),
        });
      }
      if (url.includes("/api/catalog/v1")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({ results: [], resultSetSize: 10 }),
        });
      }
      return Promise.resolve({ ok: false });
    }) as typeof fetch;

    const result = await detectProtocol(
      "https://dual-portal.com",
      mockLogger,
      5000,
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("ckan");
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;

    const result = await detectProtocol(
      "https://offline.com",
      mockLogger,
      5000,
    );

    expect(result).toBeNull();
  });

  it("handles non-JSON responses gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([["content-type", "text/html"]]),
    }) as typeof fetch;

    const result = await detectProtocol(
      "https://html-only.com",
      mockLogger,
      5000,
    );

    expect(result).toBeNull();
  });

  it("detects language from Socrata domain metadata", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/catalog/v1")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({
              results: [
                {
                  resource: { id: "abc", name: "Test" },
                  classification: {
                    domain_metadata: [
                      {
                        key: "Informacion-de-Datos_Idioma",
                        value: "Español",
                      },
                    ],
                  },
                  metadata: { domain: "www.datos.gov.co" },
                },
              ],
              resultSetSize: 8000,
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as typeof fetch;

    const result = await detectProtocol(
      "https://www.datos.gov.co",
      mockLogger,
      5000,
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("socrata");
    expect(result!.language).toBe("es");
  });

  it("strips trailing slashes from URL", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/3/action/package_search")) {
        return Promise.resolve({
          ok: true,
          headers: new Map([["content-type", "application/json"]]),
          json: () =>
            Promise.resolve({
              success: true,
              result: { count: 1, results: [] },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await detectProtocol("https://example.com///", mockLogger, 5000);

    const ckanUrl = fetchMock.mock.calls.find((c: string[]) =>
      (c[0] as string).includes("package_search"),
    );
    expect(ckanUrl).toBeDefined();
    expect((ckanUrl![0] as string).includes("///")).toBe(false);
  });
});
