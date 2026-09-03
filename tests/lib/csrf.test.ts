import { describe, expect, it, vi } from "vitest";
import { isSameOrigin } from "@/lib/csrf";

const withOrigin = (origin?: string) =>
  new Request("http://localhost:3000/api/x", {
    method: "POST",
    headers: origin ? { origin } : {}
  });

describe("isSameOrigin", () => {
  it("passes requests without an Origin header (non-browser clients)", () => {
    expect(isSameOrigin(withOrigin())).toBe(true);
  });

  it("passes when Origin matches NEXTAUTH_URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.com");
    expect(isSameOrigin(withOrigin("https://app.example.com"))).toBe(true);
  });

  it("rejects a foreign Origin", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.com");
    expect(isSameOrigin(withOrigin("https://evil.example.net"))).toBe(false);
  });

  it("compares origins, not full URLs (path on NEXTAUTH_URL is ignored)", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.com/some/base");
    expect(isSameOrigin(withOrigin("https://app.example.com"))).toBe(true);
  });

  it("treats scheme and port as part of the origin", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.com");
    expect(isSameOrigin(withOrigin("http://app.example.com"))).toBe(false);
    expect(isSameOrigin(withOrigin("https://app.example.com:8443"))).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_APP_URL when NEXTAUTH_URL is unset", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    delete process.env.NEXTAUTH_URL;
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example.com");
    expect(isSameOrigin(withOrigin("https://public.example.com"))).toBe(true);
    expect(isSameOrigin(withOrigin("https://app.example.com"))).toBe(false);
  });

  it("defaults to http://localhost:3000 when nothing is configured", () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(isSameOrigin(withOrigin("http://localhost:3000"))).toBe(true);
    expect(isSameOrigin(withOrigin("http://localhost:4000"))).toBe(false);
  });

  it("fails closed when the configured app URL is unparseable", () => {
    vi.stubEnv("NEXTAUTH_URL", "not a url");
    expect(isSameOrigin(withOrigin("http://localhost:3000"))).toBe(false);
  });
});
