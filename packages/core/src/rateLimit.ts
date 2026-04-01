import { AppError } from "./types.js";

type TBucket = { count: number; resetAt: number };

export class SlidingWindowLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, TBucket>();

  public constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  public assertAllowed(key: string): void {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    if (current.count >= this.maxRequests) {
      throw new AppError(
        "Too many requests. Please try again in a moment.",
        429,
        "RATE_LIMITED"
      );
    }

    current.count += 1;
    this.buckets.set(key, current);
  }
}
