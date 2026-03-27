/**
 * TypeScript types for CKAN v3 API responses.
 * Reference: https://docs.ckan.org/en/latest/api/index.html
 */

/** Envelope for all CKAN API responses */
export interface CkanResponse<T> {
  success: boolean;
  result: T;
  error?: { message: string; __type: string };
}

/** CKAN resource as returned by package_show / package_search */
export interface CkanResource {
  id: string;
  url: string;
  format: string;
  name?: string;
  description?: string;
  size?: number | null;
  mimetype?: string;
  created?: string;
  last_modified?: string;
}

/** CKAN organization (embedded in package) */
export interface CkanOrganization {
  id: string;
  name: string;
  title: string;
  description?: string;
}

/** CKAN tag */
export interface CkanTag {
  id: string;
  name: string;
  display_name?: string;
}

/** CKAN package (dataset) as returned by package_show / package_search */
export interface CkanPackage {
  id: string;
  name: string;
  title: string;
  notes?: string;
  organization?: CkanOrganization | null;
  tags?: CkanTag[];
  resources?: CkanResource[];
  license_title?: string;
  license_id?: string;
  metadata_created?: string;
  metadata_modified?: string;
  num_resources?: number;
  state?: string;
}

/** Result shape for package_search */
export interface CkanSearchResult {
  count: number;
  results: CkanPackage[];
}
