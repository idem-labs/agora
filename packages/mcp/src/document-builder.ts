import type { DatasetRecord } from "@agora/sdk";

/**
 * Converts a DatasetRecord into enriched text suitable for embedding.
 * The format is designed for semantic search over open data catalogs.
 */
export function buildDocument(record: DatasetRecord): string {
  const parts: string[] = [];

  if (record.organization) {
    parts.push(`Fuente: ${record.organization}`);
  }

  parts.push(`Título: ${record.title}`);

  if (record.tags.length > 0) {
    parts.push(`Tema: ${record.tags.join(", ")}`);
  }

  const formats = [
    ...new Set(record.resources.map((r) => r.format.toUpperCase())),
  ];
  if (formats.length > 0) {
    parts.push(`Formatos: ${formats.join(", ")}`);
  }

  if (record.description) {
    parts.push(`Descripción: ${record.description}`);
  }

  const text = parts.join(". ");
  return text.endsWith(".") ? text : text + ".";
}
