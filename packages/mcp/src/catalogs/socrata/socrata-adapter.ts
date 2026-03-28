import type { Catalog, DatasetRecord } from "@agora/sdk";
import type { Logger } from "../../logger.js";
import type { CatalogAdapter } from "../adapter.js";
import { SocrataClient, type SocrataClientOptions } from "./socrata-client.js";
import { mapSocrataResult } from "./socrata-mapper.js";

export interface SocrataAdapterOptions extends SocrataClientOptions {
  /** Human-readable catalog name */
  name: string;
  /** Catalog identifier (e.g. "datos-gov-co") */
  catalogId: string;
  country?: string;
  region?: string;
}

export class SocrataAdapter implements CatalogAdapter {
  readonly catalog: Catalog;
  private readonly client: SocrataClient;

  constructor(
    private readonly options: SocrataAdapterOptions,
    private readonly logger: Logger,
  ) {
    this.catalog = {
      id: options.catalogId,
      name: options.name,
      url: `https://${options.domain}`,
      type: "socrata",
      country: options.country,
      region: options.region,
      enabled: true,
    };

    this.client = new SocrataClient(options, logger);
  }

  async *listDatasets(): AsyncIterable<DatasetRecord> {
    let count = 0;
    for await (const page of this.client.listAllDatasets()) {
      for (const result of page) {
        // Only include actual datasets (skip maps, charts, etc.)
        if (result.resource.type && result.resource.type !== "dataset") continue;
        yield mapSocrataResult(result, this.options.catalogId);
        count++;
      }
    }
    this.logger.info("SocrataAdapter: listed all datasets", { count });
  }

  async *listDatasetsSince(cursor: string): AsyncIterable<DatasetRecord> {
    let count = 0;
    for await (const page of this.client.listDatasetsSince(cursor)) {
      for (const result of page) {
        if (result.resource.type && result.resource.type !== "dataset") continue;
        yield mapSocrataResult(result, this.options.catalogId);
        count++;
      }
    }
    this.logger.info("SocrataAdapter: listed datasets since cursor", { cursor, count });
  }

  async getDataset(externalId: string): Promise<DatasetRecord | null> {
    try {
      const result = await this.client.getDataset(externalId);
      if (!result) return null;
      return mapSocrataResult(result, this.options.catalogId);
    } catch (error) {
      this.logger.warn("SocrataAdapter: getDataset failed", {
        externalId,
        error: String(error),
      });
      return null;
    }
  }
}
