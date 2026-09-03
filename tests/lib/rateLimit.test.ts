import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and reports remaining budget", () => {
    const result = rateLimit("t1:first", 3, 60_000);
    expect(result).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
  });

  it("decrements remaining on each call within the window", () => {
    rateLimit("t1:decrement", 3, 60_000);
    expect(rateLimit("t1:decrement", 3, 60_000).remaining).toBe(1);
    expect(rateLimit("t1:decrement", 3, 60_000).remaining).toBe(0);
  });

  it("blocks once the limit is reached and returns a retry delay", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("t1:block", 3, 60_000);
    vi.advanceTimersByTime(10_000);
    const blocked = rateLimit("t1:block", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(50_000);
  });

  it("resets the window after windowMs elapses", () => {
    for (let i = 0; i < 2; i += 1) rateLimit("t1:reset", 2, 1_000);
    expect(rateLimit("t1:reset", 2, 1_000).allowed).toBe(false);
    vi.advanceTimersByTime(1_000);
    const fresh = rateLimit("t1:reset", 2, 1_000);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(1);
  });

  it("tracks keys independently", () => {
    rateLimit("t1:a", 1, 60_000);
    expect(rateLimit("t1:a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("t1:b", 1, 60_000).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("takes the first address from x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "198.51.100.4" } });
    expect(getClientIp(req)).toBe("198.51.100.4");
  });

  it("returns 'unknown' when no proxy headers are present", () => {
    expect(getClientIp(new Request("http://x"))).toBe("unknown");
  });
});
