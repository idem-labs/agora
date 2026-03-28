/**
 * Catalog failure tracking and skip logic.
 */
import type { CatalogState } from "../state/types.js";

const MAX_CONSECUTIVE_FAILURES = 3;
const RETRY_AFTER_DAYS = 7;

export interface SkipDecision {
  skip: boolean;
  reason?: string;
}

/**
 * Determine whether a catalog should be skipped this run.
 */
export function shouldSkipCatalog(state: CatalogState | null): SkipDecision {
  if (!state) return { skip: false };

  if (state.status !== "unreachable") return { skip: false };

  // Unreachable: skip unless enough time has passed to retry
  const lastFailure = state.lastFailure ? new Date(state.lastFailure).getTime() : 0;
  const daysSinceFailure = (Date.now() - lastFailure) / 86_400_000;

  if (daysSinceFailure >= RETRY_AFTER_DAYS) {
    return { skip: false }; // Time to retry
  }

  return {
    skip: true,
    reason: `unreachable (${state.consecutiveFailures} failures, retry in ${Math.ceil(RETRY_AFTER_DAYS - daysSinceFailure)}d)`,
  };
}

/**
 * Record a failure for a catalog. Returns updated state.
 */
export function recordFailure(state: CatalogState, reason: string): CatalogState {
  const failures = state.consecutiveFailures + 1;
  return {
    ...state,
    consecutiveFailures: failures,
    status: failures >= MAX_CONSECUTIVE_FAILURES ? "unreachable" : state.status,
    lastFailure: new Date().toISOString(),
    lastFailureReason: reason,
  };
}

/**
 * Record a success for a catalog. Resets failure counter.
 */
export function recordSuccess(state: CatalogState): CatalogState {
  return {
    ...state,
    consecutiveFailures: 0,
    status: "ok",
    lastRunAt: new Date().toISOString(),
    lastFailure: undefined,
    lastFailureReason: undefined,
  };
}
