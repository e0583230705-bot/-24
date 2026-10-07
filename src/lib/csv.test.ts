import { describe, expect, it } from "vitest";
import { csvMoney, toCsv } from "./csv";

describe("csv", () => {
  it("adds a BOM, quotes when needed and neutralizes formulas", () => {
    const csv = toCsv([
      ["שם", "סכום"],
      ['חברה בע"מ, סניף', "-12.50"],
      ["=HYPERLINK(\"x\")", 3],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"חברה בע""מ, סניף",-12.50');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",3`);
    expect(csvMoney(123456)).toBe("1234.56");
  });
});
