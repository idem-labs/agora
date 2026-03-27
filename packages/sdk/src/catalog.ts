import { z } from "zod/v4";

export const CatalogType = z.enum(["ckan", "socrata", "dcat", "ogc"]);
export type CatalogType = z.infer<typeof CatalogType>;

export const Catalog = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  type: CatalogType,
  country: z.string().optional(),
  region: z.string().optional(),
  enabled: z.boolean().default(true),
  datasetCount: z.number().int().nonnegative().optional(),
  lastSyncAt: z.iso.datetime().optional(),
});
export type Catalog = z.infer<typeof Catalog>;

export const Resource = z.object({
  id: z.string(),
  datasetId: z.string(),
  url: z.url(),
  format: z.string(),
  name: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  isAccessible: z.boolean().optional(),
  lastCheckAt: z.iso.datetime().optional(),
  responseTimeMs: z.number().nonnegative().optional(),
  encodingDetected: z.string().optional(),
  columnCount: z.number().int().nonnegative().optional(),
  rowCount: z.number().int().nonnegative().optional(),
});
export type Resource = z.infer<typeof Resource>;

export const DatasetRecord = z.object({
  id: z.string(),
  catalogId: z.string(),
  externalId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  organization: z.string().optional(),
  tags: z.array(z.string()).default([]),
  license: z.string().optional(),
  resources: z.array(Resource).default([]),
  createdAt: z.iso.datetime().optional(),
  modifiedAt: z.iso.datetime().optional(),
});
export type DatasetRecord = z.infer<typeof DatasetRecord>;
