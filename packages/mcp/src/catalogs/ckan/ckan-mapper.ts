import type { DatasetRecord, Resource } from "@agora/sdk";
import type { CkanPackage, CkanResource } from "./ckan-types.js";

/** Map a CKAN resource to the SDK Resource model */
function mapResource(r: CkanResource, datasetId: string): Resource {
  return {
    id: r.id,
    datasetId,
    url: r.url,
    format: (r.format || "unknown").toUpperCase(),
    name: r.name || undefined,
    sizeBytes: r.size != null && r.size > 0 ? r.size : undefined,
  };
}

/** Map a CKAN package to the SDK DatasetRecord model */
export function mapCkanPackage(
  pkg: CkanPackage,
  catalogId: string,
): DatasetRecord {
  const id = `${catalogId}:${pkg.name}`;

  return {
    id,
    catalogId,
    externalId: pkg.name,
    title: pkg.title || pkg.name,
    description: pkg.notes || undefined,
    organization: pkg.organization?.title || pkg.organization?.name || undefined,
    tags: (pkg.tags ?? []).map((t) => t.display_name || t.name),
    license: pkg.license_title || pkg.license_id || undefined,
    resources: (pkg.resources ?? []).map((r) => mapResource(r, id)),
    createdAt: pkg.metadata_created || undefined,
    modifiedAt: pkg.metadata_modified || undefined,
  };
}
