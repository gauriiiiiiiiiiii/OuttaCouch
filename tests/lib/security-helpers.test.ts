import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/escapeHtml";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password";

describe("escapeHtml", () => {
  it("neutralises the five HTML metacharacters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('xss')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;"
    );
  });

  it("leaves plain text untouched and coerces non-strings", () => {
    expect(escapeHtml("Rooftop Jam")).toBe("Rooftop Jam");
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("validatePassword", () => {
  it("accepts passwords within the length bounds", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword("correct horse battery staple")).toBeNull();
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects short, overlong and non-string passwords", () => {
    expect(validatePassword("short")).toMatch(/at least 8/);
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/at most 128/);
    expect(validatePassword(undefined)).toBe("Password required");
    expect(validatePassword(12345678)).toBe("Password required");
  });
});
