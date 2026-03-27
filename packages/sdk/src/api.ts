/**
 * TENTATIVE — These API contracts are a draft for Platform integration (Phases 4-5).
 * They will be revisited when we design the Platform in detail.
 */
import { z } from "zod/v4";
import { Catalog } from "./catalog.js";
import { QualityScore } from "./quality.js";
import { EventBatch } from "./events.js";

// POST /v1/events/batch
export const EventBatchRequest = EventBatch;
export const EventBatchResponse = z.object({
  accepted: z.number().int().nonnegative(),
});

// GET /v1/datasets/:id/score
export const DatasetScoreResponse = QualityScore;

// GET /v1/catalogs
export const CatalogListResponse = z.array(Catalog);
