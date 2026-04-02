import type { Catalog, DatasetRecord } from "@agora/sdk";

/**
 * Common interface for all open-data catalog adapters (CKAN, Socrata, DCAT, etc.).
 * Each adapter normalizes a specific API into the shared DatasetRecord model.
 */
export interface CatalogAdapter {
  /** Catalog metadata */
  readonly catalog: Catalog;

  /** Iterate over all datasets with automatic pagination */
  listDatasets(): AsyncIterable<DatasetRecord>;

  /** Iterate over datasets modified since a timestamp (for incremental scoring). Optional. */
  listDatasetsSince?(cursor: string): AsyncIterable<DatasetRecord>;

  /** Fetch a single dataset by its external (catalog-native) ID */
  getDataset(externalId: string): Promise<DatasetRecord | null>;

  /** Return the total number of datasets in the catalog (cheap metadata-only call). Optional. */
  getDatasetCount?(): Promise<number>;
}
