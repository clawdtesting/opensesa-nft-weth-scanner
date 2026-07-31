/**
 * Simple token-bucket rate limiter.
 *
 * OpenSea's default budget is a few requests per second; we treat that budget as
 * a first-class engineering constraint. Callers `await limiter.take()` before
 * every request. Refills continuously at `rps` tokens/second up to `burst`.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly rps: number;
  private readonly burst: number;
  private queue: Array<() => void> = [];

  constructor(rps: number, burst = rps) {
    this.rps = Math.max(0.1, rps);
    this.burst = Math.max(1, burst);
    this.tokens = this.burst;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rps);
    this.lastRefill = now;
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait for the next token to become available.
    const waitMs = ((1 - this.tokens) / this.rps) * 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
    return this.take();
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
