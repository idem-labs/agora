import type { DatasetRecord, DimensionScore } from "@agora/sdk";
import type { Scorer } from "./scorer.js";

export interface AccessibilityConfig {
  /** HEAD request timeout in ms */
  headTimeoutMs: number;
  /** Max concurrent HEAD requests */
  concurrency: number;
}

/** Map HTTP status codes to accessibility scores. */
export function statusToScore(status: number): number {
  if (status >= 200 && status < 300) return 1.0;
  if (status === 301 || status === 302 || status === 307 || status === 308) return 0.9;
  if (status === 403) return 0.3;
  if (status >= 500) return 0.2;
  // 4xx (404, 410, etc.) and anything else
  return 0.0;
}

interface CheckResult {
  url: string;
  status: number | null;
  score: number;
}

/**
 * Scores dataset accessibility by performing HEAD requests against resource URLs.
 * Uses a concurrency limiter to avoid overwhelming servers.
 */
export class AccessibilityScorer implements Scorer {
  readonly dimension = "accessibility" as const;
  private readonly config: AccessibilityConfig;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(config: AccessibilityConfig) {
    this.config = config;
  }

  async score(dataset: DatasetRecord): Promise<DimensionScore> {
    const resources = dataset.resources ?? [];

    if (resources.length === 0) {
      return {
        dimension: "accessibility",
        score: 0,
        evidence: { resourceCount: 0, checked: 0, accessible: 0, results: [] },
        calculatedAt: new Date().toISOString(),
      };
    }

    const results = await Promise.all(
      resources.map((r) => this.limited(() => this.checkUrl(r.url))),
    );

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      dimension: "accessibility",
      score: Math.round(avgScore * 1000) / 1000,
      evidence: {
        resourceCount: resources.length,
        checked: results.length,
        accessible: results.filter((r) => r.score >= 0.9).length,
      },
      calculatedAt: new Date().toISOString(),
    };
  }

  private async checkUrl(url: string): Promise<CheckResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.headTimeoutMs);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeout);
      return { url, status: response.status, score: statusToScore(response.status) };
    } catch {
      return { url, status: null, score: 0 };
    }
  }

  /** Simple concurrency limiter (no external deps). */
  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.config.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
