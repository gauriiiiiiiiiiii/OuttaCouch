import { describe, expect, it, vi } from "vitest";
import { normalizeContact } from "@/lib/normalizeContact";

describe("normalizeContact", () => {
  it("returns empty string for empty, null, undefined or whitespace", () => {
    expect(normalizeContact("")).toBe("");
    expect(normalizeContact(null)).toBe("");
    expect(normalizeContact(undefined)).toBe("");
    expect(normalizeContact("    ")).toBe("");
  });

  it("lower-cases and trims emails", () => {
    expect(normalizeContact("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
  });

  it("prefixes a bare 10-digit number with the default country code", () => {
    expect(normalizeContact("9876543210")).toBe("+919876543210");
  });

  it("strips spaces, dashes and parentheses from phone numbers", () => {
    expect(normalizeContact("+91 (98765) 43-210")).toBe("+919876543210");
    expect(normalizeContact("98765 43210")).toBe("+919876543210");
  });

  it("converts a 00 international prefix to +", () => {
    expect(normalizeContact("00919876543210")).toBe("+919876543210");
  });

  it("adds + when the number already starts with the default country code", () => {
    expect(normalizeContact("919876543210")).toBe("+919876543210");
  });

  it("adds + to other bare numbers without guessing a country", () => {
    expect(normalizeContact("12345678")).toBe("+12345678");
    expect(normalizeContact("447911123456")).toBe("+447911123456");
  });

  it("rejects numbers that are too short after normalisation", () => {
    expect(normalizeContact("1234")).toBe("");
    expect(normalizeContact("+123")).toBe("");
  });

  it("rejects input with no digits at all", () => {
    expect(normalizeContact("abc")).toBe("");
    expect(normalizeContact("---")).toBe("");
  });

  it("respects DEFAULT_PHONE_COUNTRY_CODE", () => {
    vi.stubEnv("DEFAULT_PHONE_COUNTRY_CODE", "1");
    expect(normalizeContact("2125551234")).toBe("+12125551234");
    expect(normalizeContact("12125551234")).toBe("+12125551234");
  });

  it("falls back to 91 when DEFAULT_PHONE_COUNTRY_CODE is empty", () => {
    vi.stubEnv("DEFAULT_PHONE_COUNTRY_CODE", "");
    expect(normalizeContact("9876543210")).toBe("+919876543210");
  });
});
