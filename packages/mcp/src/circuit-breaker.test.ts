import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, CircuitBreakerError, jitteredBackoff } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 1000,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe("closed");
  });

  it("passes through successful calls", async () => {
    const result = await breaker.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(breaker.getState()).toBe("closed");
  });

  it("passes through errors in closed state below threshold", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("open");
  });

  it("rejects calls immediately when open", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("fail");
    }
    await expect(breaker.execute(() => Promise.resolve(1))).rejects.toThrow(CircuitBreakerError);
  });

  it("transitions to half-open after reset timeout", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("open");

    // Advance time past reset timeout
    vi.useFakeTimers();
    vi.advanceTimersByTime(1100);
    expect(breaker.getState()).toBe("half_open");
    vi.useRealTimers();
  });

  it("closes after success threshold in half-open", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("fail");
    }

    vi.useFakeTimers();
    vi.advanceTimersByTime(1100);

    // Successful calls in half-open
    await breaker.execute(() => Promise.resolve(1));
    expect(breaker.getState()).toBe("half_open");
    await breaker.execute(() => Promise.resolve(2));
    expect(breaker.getState()).toBe("closed");
    vi.useRealTimers();
  });

  it("reopens on failure in half-open", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("fail");
    }

    vi.useFakeTimers();
    vi.advanceTimersByTime(1100);
    expect(breaker.getState()).toBe("half_open");

    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("open");
    vi.useRealTimers();
  });

  it("resets failure counter on success in closed state", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    // 2 failures (under threshold of 3)
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    // 1 success resets counter
    await breaker.execute(() => Promise.resolve(1));
    // 2 more failures — still under threshold since counter was reset
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    await expect(breaker.execute(fn)).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("closed");
  });
});

describe("jitteredBackoff", () => {
  it("returns value in [0, baseMs * 2^attempt]", () => {
    for (let i = 0; i < 100; i++) {
      const delay = jitteredBackoff(2, 1000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(4000);
    }
  });

  it("returns 0 for attempt 0 with base 0", () => {
    expect(jitteredBackoff(0, 0)).toBe(0);
  });
});
