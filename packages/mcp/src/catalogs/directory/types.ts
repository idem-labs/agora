export interface CatalogEntry {
  id: string;
  name: string;
  url: string;
  protocol: "ckan" | "socrata" | "dcat";
  language: string;
  country: string;
  tags: string[];
  /** Custom API base path for non-standard CKAN installs (e.g. "/opendata" for dati.gov.it) */
  apiPath?: string;
}

export interface PresetEntry {
  id: string;
  name: string;
  description: string;
  catalogIds: string[];
}
