/**
 * TENTATIVE — These event schemas are a draft for Platform integration (Phases 4-5).
 * They will be revisited when we design the Platform in detail.
 */
import { z } from "zod/v4";

const BaseEvent = z.object({
  id: z.string().optional(),
  timestamp: z.iso.datetime(),
  clientId: z.string(),
  datasetId: z.string().optional(),
  resourceUrl: z.string().optional(),
  success: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
});

export const SearchEvent = BaseEvent.extend({
  type: z.literal("search"),
  query: z.string(),
  catalogId: z.string().optional(),
  resultCount: z.number().int().nonnegative(),
});
export type SearchEvent = z.infer<typeof SearchEvent>;

export const QueryEvent = BaseEvent.extend({
  type: z.literal("query"),
  sql: z.string(),
  rowsReturned: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});
export type QueryEvent = z.infer<typeof QueryEvent>;

export const InspectEvent = BaseEvent.extend({
  type: z.literal("inspect"),
  format: z.string().optional(),
  columnCount: z.number().int().nonnegative().optional(),
  rowCount: z.number().int().nonnegative().optional(),
});
export type InspectEvent = z.infer<typeof InspectEvent>;

export const ErrorEvent = BaseEvent.extend({
  type: z.literal("error"),
  errorCode: z.string(),
  errorMessage: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

export const UsageEvent = z.discriminatedUnion("type", [
  SearchEvent,
  QueryEvent,
  InspectEvent,
  ErrorEvent,
]);
export type UsageEvent = z.infer<typeof UsageEvent>;

export const EventBatch = z.object({
  clientId: z.string(),
  events: z.array(UsageEvent).min(1).max(1000),
});
export type EventBatch = z.infer<typeof EventBatch>;
