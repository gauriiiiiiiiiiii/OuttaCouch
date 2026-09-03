import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkVerification } from "@/lib/twilioVerify";

describe("rateLimit purge interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("drops expired windows every 10 minutes and keeps live ones", async () => {
    vi.resetModules();
    const { rateLimit } = await import("@/lib/rateLimit");
    rateLimit("purge:short", 1, 1_000); // expires after 1s
    rateLimit("purge:long", 1, 60 * 60_000); // still live after the purge
    vi.advanceTimersByTime(10 * 60_000 + 1);
    // The short window was purged: a fresh request starts a new window (allowed).
    expect(rateLimit("purge:short", 1, 1_000).allowed).toBe(true);
    // The long window survived: its single slot is still taken.
    expect(rateLimit("purge:long", 1, 60 * 60_000).allowed).toBe(false);
  });
});

describe("twilioVerify.checkVerification — odd payloads", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA");
  });

  it("uses the raw body as the error when Twilio omits a status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ sid: "x" }), { status: 200 }));
    await expect(checkVerification("+1", "1")).resolves.toEqual({ status: "failed", error: JSON.stringify({ sid: "x" }) });
  });
});
