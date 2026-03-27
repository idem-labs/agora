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

  /** Fetch a single dataset by its external (catalog-native) ID */
  getDataset(externalId: string): Promise<DatasetRecord | null>;
}
