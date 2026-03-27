import type { DatasetRecord, Resource } from "@agora/sdk";
import type { SocrataResult } from "./socrata-types.js";

/** Strip basic HTML tags from description text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Build the CSV download URL for a Socrata dataset */
function buildDownloadUrl(domain: string, resourceId: string): string {
  return `https://${domain}/api/views/${resourceId}/rows.csv?accessType=DOWNLOAD`;
}

/** Map a Socrata result's resource to the SDK Resource model */
function mapResource(
  result: SocrataResult,
  datasetId: string,
): Resource {
  return {
    id: result.resource.id,
    datasetId,
    url: buildDownloadUrl(result.metadata.domain, result.resource.id),
    format: "CSV",
    name: result.resource.name || undefined,
  };
}

/** Map a Socrata Discovery API result to the SDK DatasetRecord model */
export function mapSocrataResult(
  result: SocrataResult,
  catalogId: string,
): DatasetRecord {
  const id = `${catalogId}:${result.resource.id}`;

  const description = result.resource.description
    ? stripHtml(result.resource.description)
    : undefined;

  // Organization: prefer attribution, fallback to domain_metadata agency
  let organization = result.resource.attribution || undefined;
  if (!organization && result.classification.domain_metadata) {
    const agency = result.classification.domain_metadata.find(
      (m) =>
        m.key === "Dataset-Information_Agency" ||
        m.key.includes("Entidad") ||
        m.key.includes("Agency"),
    );
    if (agency) organization = agency.value;
  }

  // Tags: prefer domain_tags, fallback to classification tags
  const tags =
    result.classification.domain_tags ??
    result.classification.tags ??
    [];

  return {
    id,
    catalogId,
    externalId: result.resource.id,
    title: result.resource.name,
    description,
    organization,
    tags,
    license: result.metadata.license || undefined,
    resources: [mapResource(result, id)],
    createdAt: result.resource.createdAt || undefined,
    modifiedAt: result.resource.data_updated_at ?? result.resource.updatedAt ?? undefined,
  };
}
