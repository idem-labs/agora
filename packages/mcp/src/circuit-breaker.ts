/**
 * Generic circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED.
 *
 * Prevents cascading failures by fast-failing requests to degraded services.
 * Each circuit breaker instance tracks one logical endpoint (e.g., a catalog API).
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening (default: 5). */
  failureThreshold?: number;
  /** Successes in half-open required to close (default: 2). */
  successThreshold?: number;
  /** Time in ms to wait in open state before half-opening (default: 60_000). */
  resetTimeoutMs?: number;
}

export class CircuitBreakerError extends Error {
  constructor(public readonly name_: string) {
    super(`Circuit breaker "${name_}" is open — requests are being rejected`);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  readonly id: string;
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureAt = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(id: string, options?: CircuitBreakerOptions) {
    this.id = id;
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.successThreshold = options?.successThreshold ?? 2;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 60_000;
  }

  getState(): CircuitState {
    if (this.state === "open" && Date.now() - this.lastFailureAt >= this.resetTimeoutMs) {
      this.state = "half_open";
      this.successes = 0;
    }
    return this.state;
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws CircuitBreakerError immediately if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === "open") {
      throw new CircuitBreakerError(this.id);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
      }
    } else {
      // Reset consecutive failure counter on any success in closed state
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === "half_open") {
      // Any failure in half-open goes back to open
      this.state = "open";
      this.successes = 0;
    } else if (this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }
}

/**
 * Full jitter exponential backoff delay.
 * Returns random value in [0, baseMs * 2^attempt].
 */
export function jitteredBackoff(attempt: number, baseMs = 1000): number {
  const cap = baseMs * 2 ** attempt;
  return Math.floor(Math.random() * cap);
}
