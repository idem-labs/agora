import type { Catalog } from "@agora/sdk";
import type { Logger } from "../logger.js";
import type { CatalogAdapter } from "./adapter.js";
import { CkanAdapter } from "./ckan/ckan-adapter.js";
import type { CatalogEntry } from "./directory/types.js";
import { SocrataAdapter } from "./socrata/socrata-adapter.js";

/**
 * Registry of configured catalog adapters.
 * Creates the right adapter per catalog entry based on protocol.
 */
export class CatalogRegistry {
  private readonly adapters = new Map<string, CatalogAdapter>();

  constructor(entries: CatalogEntry[], logger: Logger) {
    for (const entry of entries) {
      const adapter = createAdapter(entry, logger);
      if (adapter) {
        this.adapters.set(entry.id, adapter);
      } else {
        logger.warn("Unsupported protocol, skipping catalog", {
          catalogId: entry.id,
          protocol: entry.protocol,
        });
      }
    }
    logger.info("CatalogRegistry initialized", {
      catalogs: [...this.adapters.keys()],
    });
  }

  get(catalogId: string): CatalogAdapter | undefined {
    return this.adapters.get(catalogId);
  }

  list(): Catalog[] {
    return [...this.adapters.values()].map((a) => a.catalog);
  }

  listAdapters(): CatalogAdapter[] {
    return [...this.adapters.values()];
  }
}

function createAdapter(
  entry: CatalogEntry,
  logger: Logger,
): CatalogAdapter | null {
  switch (entry.protocol) {
    case "ckan":
      return new CkanAdapter(
        {
          catalogId: entry.id,
          name: entry.name,
          baseUrl: entry.url,
          apiPath: entry.apiPath,
          country: entry.country,
        },
        logger,
      );
    case "socrata":
      return new SocrataAdapter(
        {
          catalogId: entry.id,
          name: entry.name,
          domain: new URL(entry.url).host,
          country: entry.country,
        },
        logger,
      );
    // Future: case "dcat": return new DcatAdapter(...)
    default:
      return null;
  }
}
