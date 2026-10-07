import { describe, expect, it } from "vitest";
import { applyPercent, formatILS, parseShekels, toAgorot } from "./money";
import { addVat, splitGross, vatRateOn } from "./vat";
import { isValidIsraeliId } from "./israeli-id";

describe("money", () => {
  it("parses user input to agorot", () => {
    expect(parseShekels("1,234.50")).toBe(123450);
    expect(parseShekels("₪99")).toBe(9900);
    expect(parseShekels("abc")).toBeNull();
    expect(parseShekels("1.234")).toBeNull();
  });
  it("avoids floating point drift", () => {
    expect(toAgorot(0.1 + 0.2)).toBe(30);
    expect(applyPercent(1000, 66.67)).toBe(667);
  });
  it("formats shekels", () => {
    expect(formatILS(123450)).toContain("1,234.50");
  });
});

describe("vat", () => {
  it("knows the rate by date", () => {
    expect(vatRateOn("2024-12-31")).toBe(17);
    expect(vatRateOn("2025-01-01")).toBe(18);
  });
  it("adds and splits VAT consistently", () => {
    expect(addVat(10000, 18)).toEqual({ net: 10000, vat: 1800, gross: 11800, rate: 18 });
    const s = splitGross(11800, 18);
    expect(s.net).toBe(10000);
    expect(s.vat).toBe(1800);
    const odd = splitGross(999, 18);
    expect(odd.net + odd.vat).toBe(999);
  });
});

describe("israeli id", () => {
  it("validates check digit", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("12a")).toBe(false);
  });
});
