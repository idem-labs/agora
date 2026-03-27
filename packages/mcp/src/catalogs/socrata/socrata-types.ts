/**
 * TypeScript types for Socrata Discovery API (catalog/v1) responses.
 * Reference: https://socratadiscovery.docs.apiary.io/
 */

/** Envelope for Discovery API responses */
export interface SocrataDiscoveryResponse {
  results: SocrataResult[];
  resultSetSize: number;
  timings?: { serviceMillis: number; searchMillis: number[] };
  warnings?: string[];
}

/** A single result from the Discovery API */
export interface SocrataResult {
  resource: SocrataResource;
  classification: SocrataClassification;
  metadata: SocrataMetadata;
  permalink: string;
  link: string;
  owner: SocrataUser;
  creator: SocrataUser;
}

/** Core resource metadata */
export interface SocrataResource {
  id: string;
  name: string;
  description: string;
  attribution?: string;
  attribution_link?: string | null;
  type: string;
  updatedAt: string;
  createdAt: string;
  metadata_updated_at?: string;
  data_updated_at?: string | null;
  download_count?: number;
  page_views?: SocrataPageViews;
  columns_name?: string[];
  columns_field_name?: string[];
  columns_datatype?: string[];
  provenance?: string;
  lens_view_type?: string;
}

/** Classification / taxonomy info */
export interface SocrataClassification {
  categories?: string[];
  tags?: string[];
  domain_category?: string;
  domain_tags?: string[];
  domain_metadata?: SocrataDomainMetadataEntry[];
}

export interface SocrataDomainMetadataEntry {
  key: string;
  value: string;
}

/** Portal-level metadata */
export interface SocrataMetadata {
  domain: string;
  license?: string;
}

export interface SocrataPageViews {
  page_views_last_week?: number;
  page_views_last_month?: number;
  page_views_total?: number;
}

export interface SocrataUser {
  id: string;
  user_type?: string;
  display_name?: string;
}
