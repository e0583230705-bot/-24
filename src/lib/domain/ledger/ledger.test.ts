import { describe, expect, it } from "vitest";
import { trialBalance, unbalancedEntries } from "./trial-balance";
import { testJournalEntries } from "./journal-tests";
import { benford, BENFORD_EXPECTED } from "./benford";
import { computeMateriality } from "./materiality";
import { monetaryUnitSample } from "./sampling";
import type { LedgerLine } from "./types";

const line = (entryId: string, date: string, accountCode: string, amount: number, description = "פקודה"): LedgerLine => ({
  entryId,
  date,
  accountCode,
  amount,
  description,
  reference: null,
});

describe("trial balance", () => {
  const accounts = [
    { code: "1000", name: "קופה", openingBalance: 500000 },
    { code: "3000", name: "הון", openingBalance: -500000 },
    { code: "4000", name: "הכנסות", openingBalance: 0 },
  ];
  it("sums debits, credits and closing balances and checks they balance", () => {
    const tb = trialBalance(accounts, [line("1", "2026-03-01", "1000", 100000), line("1", "2026-03-01", "4000", -100000)]);
    expect(tb.rows.find((r) => r.code === "1000")).toMatchObject({ debits: 100000, credits: 0, closing: 600000 });
    expect(tb.rows.find((r) => r.code === "4000")).toMatchObject({ debits: 0, credits: 100000, closing: -100000 });
    expect(tb.balanced).toBe(true);
  });
  it("keeps lines of unknown accounts and detects unbalanced entries", () => {
    const lines = [line("1", "2026-03-01", "1000", 100000), line("1", "2026-03-01", "9999", -90000)];
    const tb = trialBalance(accounts, lines);
    expect(tb.rows.find((r) => r.code === "9999")?.name).toMatch(/לא מוגדר/);
    expect(tb.balanced).toBe(false);
    expect(unbalancedEntries(lines)).toEqual([{ entryId: "1", difference: 10000 }]);
  });
});

describe("journal entry testing", () => {
  const opts = { yearEnd: "2026-12-31", performanceMateriality: 5000000 };
  it("flags risk characteristics", () => {
    const lines = [
      // שבת, סכום עגול, בלי תיאור
      line("a", "2026-10-03", "1000", 500000, ""),
      line("a", "2026-10-03", "4000", -500000, ""),
      // סמוך לסוף השנה, מעל המהותיות
      line("b", "2026-12-30", "1000", 6000050),
      line("b", "2026-12-30", "4000", -6000050),
      // אחרי סוף השנה
      line("c", "2027-01-04", "1000", 12345),
      line("c", "2027-01-04", "4000", -12345),
      // רגילה
      line("d", "2026-06-10", "1000", 12345),
      line("d", "2026-06-10", "4000", -12345),
    ];
    const flagged = Object.fromEntries(testJournalEntries(lines, opts).map((f) => [f.entryId, f.flags]));
    expect(flagged.a).toEqual(expect.arrayContaining(["weekend", "round_amount", "no_description"]));
    expect(flagged.b).toEqual(expect.arrayContaining(["near_year_end", "large_amount"]));
    expect(flagged.c).toEqual(["after_year_end"]);
    expect(flagged.d).toBeUndefined();
  });
  it("detects duplicate entries", () => {
    const lines = [
      line("x", "2026-06-10", "1000", 77700),
      line("x", "2026-06-10", "4000", -77700),
      line("y", "2026-06-10", "4000", -77700),
      line("y", "2026-06-10", "1000", 77700),
    ];
    expect(testJournalEntries(lines, opts).map((f) => f.flags)).toEqual([["duplicate"], ["duplicate"]]);
  });
});

describe("benford", () => {
  it("recognizes a Benford-like population and a fabricated one", () => {
    // אוכלוסייה גאומטרית — מתפלגת לפי בנפורד
    const natural = Array.from({ length: 2000 }, (_, i) => Math.round(1000 * Math.pow(1.0071, i)));
    const good = benford(natural);
    expect(good.n).toBeGreaterThan(1500);
    expect(good.conformity).toBe("close");
    expect(good.reliable).toBe(true);
    // סכומים "מומצאים" שמתחילים כולם ב־5 עד 9
    const fake = benford(Array.from({ length: 500 }, (_, i) => (5 + (i % 5)) * 10000 + i));
    expect(fake.conformity).toBe("nonconformity");
    expect(BENFORD_EXPECTED[0]).toBeCloseTo(0.30103, 4);
  });
  it("ignores small amounts and reports small samples as unreliable", () => {
    const r = benford([500, 999, 1500, 2500]);
    expect(r.n).toBe(2);
    expect(r.reliable).toBe(false);
  });
});

describe("materiality", () => {
  it("derives overall, performance and trivial thresholds", () => {
    expect(computeMateriality(-200000000, 5)).toEqual({ overall: 10000000, performance: 7500000, trivial: 500000 });
  });
});

describe("monetary unit sampling", () => {
  const items = [
    { id: "big", amount: 900000 },
    ...Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, amount: 20000 })),
  ];
  it("always selects items larger than the interval and is reproducible with the same seed", () => {
    const a = monetaryUnitSample(items, 10, 42);
    expect(a.interval).toBe(190000);
    expect(a.selected.find((s) => s.id === "big")?.reason).toBe("key");
    expect(a.selected.length).toBeGreaterThanOrEqual(5);
    expect(monetaryUnitSample(items, 10, 42)).toEqual(a);
    expect(monetaryUnitSample(items, 10, 7).selected).not.toEqual(a.selected);
    expect(new Set(a.selected.map((s) => s.id)).size).toBe(a.selected.length);
  });
});

describe("ledger CSV import", async () => {
  const { parseLedgerCsv } = await import("./import-csv");
  it("reads a debit/credit general ledger export with a preamble", () => {
    const csv = [
      "כרטסת הנהלת חשבונות 2026",
      "תאריך,מספר תנועה,חשבון,שם חשבון,פרטים,אסמכתא,חובה,זכות",
      '05/03/2026,101,1000,קופה,"מכירה במזומן",55,"1,180.00",',
      "05/03/2026,101,4000,הכנסות,מכירה במזומן,55,,1000.00",
      "05/03/2026,101,2200,מע\"מ עסקאות,מכירה במזומן,55,,180.00",
      ',סה"כ,,,,,1180.00,1180.00',
    ].join("\n");
    const r = parseLedgerCsv(csv);
    expect(r.accounts.map((a) => [a.code, a.name])).toEqual([
      ["1000", "קופה"],
      ["4000", "הכנסות"],
      ["2200", 'מע"מ עסקאות'],
    ]);
    expect(r.lines.map((l) => l.amount)).toEqual([118000, -100000, -18000]);
    expect(r.lines[0]).toMatchObject({ entryId: "101", date: "2026-03-05", description: "מכירה במזומן", reference: "55" });
    expect(r.skipped).toBe(1);
  });
  it("explains files it cannot read", () => {
    expect(() => parseLedgerCsv("a,b\n1,2")).toThrow(/לא זוהו/);
  });
});
