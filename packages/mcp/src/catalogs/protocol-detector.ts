import type { Logger } from "../logger.js";

export type DetectedProtocol = "ckan" | "socrata";

export interface DetectResult {
  protocol: DetectedProtocol;
  /** Language detected from metadata (e.g. "es", "en"), if available */
  language?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Probe a URL to detect whether the portal runs CKAN or Socrata.
 * Tries lightweight requests against known API endpoints.
 * Returns null if neither protocol is detected.
 */
export async function detectProtocol(
  url: string,
  logger: Logger,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<DetectResult | null> {
  const base = url.replace(/\/+$/, "");
  const host = new URL(base).host;

  // Run probes in parallel — first one to succeed wins
  const results = await Promise.allSettled([
    probeCkan(base, timeoutMs),
    probeSocrata(host, timeoutMs),
  ]);

  const ckan = results[0].status === "fulfilled" ? results[0].value : null;
  const socrata = results[1].status === "fulfilled" ? results[1].value : null;

  if (ckan) {
    logger.info("Protocol detected: CKAN", { url });
    return ckan;
  }
  if (socrata) {
    logger.info("Protocol detected: Socrata", { url });
    return socrata;
  }

  logger.warn("No protocol detected", { url });
  return null;
}

async function probeCkan(
  baseUrl: string,
  timeoutMs: number,
): Promise<DetectResult | null> {
  const url = `${baseUrl}/api/3/action/package_search?rows=1`;
  const body = await fetchJson(url, timeoutMs);
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;
  if (obj.success !== true) return null;

  // Try to detect language from first result
  let language: string | undefined;
  const result = obj.result as Record<string, unknown> | undefined;
  if (result) {
    const results = result.results as Array<Record<string, unknown>> | undefined;
    if (results?.[0]) {
      language = detectLanguageFromCkan(results[0]);
    }
  }

  return { protocol: "ckan", language };
}

async function probeSocrata(
  host: string,
  timeoutMs: number,
): Promise<DetectResult | null> {
  const url = `https://${host}/api/catalog/v1?limit=1&only=datasets`;
  const body = await fetchJson(url, timeoutMs);
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;
  if (typeof obj.resultSetSize !== "number") return null;

  // Try to detect language from domain metadata
  let language: string | undefined;
  const results = obj.results as Array<Record<string, unknown>> | undefined;
  if (results?.[0]) {
    language = detectLanguageFromSocrata(results[0]);
  }

  return { protocol: "socrata", language };
}

function detectLanguageFromCkan(
  pkg: Record<string, unknown>,
): string | undefined {
  // Some CKAN portals set language in notes or metadata_language
  const lang = pkg.metadata_language as string | undefined;
  if (lang && lang.length >= 2) return lang.slice(0, 2).toLowerCase();
  return undefined;
}

function detectLanguageFromSocrata(
  result: Record<string, unknown>,
): string | undefined {
  const classification = result.classification as
    | Record<string, unknown>
    | undefined;
  if (!classification) return undefined;

  const domainMetadata = classification.domain_metadata as
    | Array<{ key: string; value: string }>
    | undefined;
  if (!domainMetadata) return undefined;

  const langEntry = domainMetadata.find(
    (m) => m.key.includes("Idioma") || m.key.includes("Language"),
  );
  if (langEntry) {
    const val = langEntry.value.toLowerCase();
    if (val.startsWith("es") || val.includes("español")) return "es";
    if (val.startsWith("en") || val.includes("english")) return "en";
    if (val.startsWith("pt") || val.includes("portugu")) return "pt";
    if (val.startsWith("fr") || val.includes("fran")) return "fr";
  }
  return undefined;
}

async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "agora-mcp/0.1" },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null;

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
