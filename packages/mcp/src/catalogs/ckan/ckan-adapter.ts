import type { Catalog, DatasetRecord } from "@agora/sdk";
import type { Logger } from "../../logger.js";
import type { CatalogAdapter } from "../adapter.js";
import { CkanClient, type CkanClientOptions } from "./ckan-client.js";
import { mapCkanPackage } from "./ckan-mapper.js";

export interface CkanAdapterOptions extends CkanClientOptions {
  /** Human-readable catalog name */
  name: string;
  /** Catalog identifier (e.g. "datos-gob-ar") */
  catalogId: string;
  country?: string;
  region?: string;
}

export class CkanAdapter implements CatalogAdapter {
  readonly catalog: Catalog;
  private readonly client: CkanClient;

  constructor(
    private readonly options: CkanAdapterOptions,
    private readonly logger: Logger,
  ) {
    this.catalog = {
      id: options.catalogId,
      name: options.name,
      url: options.baseUrl,
      type: "ckan",
      country: options.country,
      region: options.region,
      enabled: true,
    };

    this.client = new CkanClient(options, logger);
  }

  async *listDatasets(): AsyncIterable<DatasetRecord> {
    let count = 0;
    for await (const page of this.client.listAllPackages()) {
      for (const pkg of page) {
        if (pkg.state && pkg.state !== "active") continue;
        yield mapCkanPackage(pkg, this.options.catalogId);
        count++;
      }
    }
    this.logger.info("CkanAdapter: listed all datasets", { count });
  }

  async *listDatasetsSince(cursor: string): AsyncIterable<DatasetRecord> {
    let count = 0;
    for await (const page of this.client.listPackagesSince(cursor)) {
      for (const pkg of page) {
        if (pkg.state && pkg.state !== "active") continue;
        yield mapCkanPackage(pkg, this.options.catalogId);
        count++;
      }
    }
    this.logger.info("CkanAdapter: listed datasets since cursor", { cursor, count });
  }

  async getDatasetCount(): Promise<number> {
    const result = await this.client.searchPackages(0, 1);
    return result.count;
  }

  async getDataset(externalId: string): Promise<DatasetRecord | null> {
    try {
      const pkg = await this.client.getPackage(externalId);
      return mapCkanPackage(pkg, this.options.catalogId);
    } catch (error) {
      this.logger.warn("CkanAdapter: getDataset failed", {
        externalId,
        error: String(error),
      });
      return null;
    }
  }
}
