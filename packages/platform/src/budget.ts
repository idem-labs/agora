/**
 * Budget timer — tracks time budget for pipeline runs.
 */
export class BudgetTimer {
  private readonly startMs: number;
  private readonly budgetMs: number;

  constructor(budgetMinutes: number) {
    this.startMs = Date.now();
    this.budgetMs = budgetMinutes * 60_000;
  }

  elapsedMs(): number {
    return Date.now() - this.startMs;
  }

  remainingMs(): number {
    return Math.max(0, this.budgetMs - this.elapsedMs());
  }

  remainingMin(): number {
    return this.remainingMs() / 60_000;
  }

  usedMin(): number {
    return this.elapsedMs() / 60_000;
  }

  /** Returns true if remaining time is less than the reserve (default 10 min). */
  isExhausted(reserveMin = 10): boolean {
    return this.remainingMin() < reserveMin;
  }
}
