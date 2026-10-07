import { describe, expect, it } from "vitest";
import { compareYears, monthlySpikes } from "./analytics";
import type { LedgerLine } from "./types";

const l = (date: string, accountCode: string, amount: number): LedgerLine => ({
  entryId: date + accountCode,
  date,
  accountCode,
  amount,
  description: "",
  reference: null,
});
const accounts = (rows: [string, string, string?][]) =>
  rows.map(([code, name, group]) => ({ code, name, openingBalance: 0, trialBalanceCode: group ?? null, trialBalanceName: group ? `קבוצה ${group}` : null }));

describe("compareYears", () => {
  const prior = {
    accounts: accounts([["4000", "הכנסות", "40"], ["6000", "משרד", "60"], ["6100", "שכירות", "60"], ["7000", "ישן"]]),
    lines: [l("2024-06-01", "4000", -1_000_000_00), l("2024-06-01", "6000", 50_000_00), l("2024-06-01", "6100", 120_000_00), l("2024-06-01", "7000", 90_000_00)],
  };
  const current = {
    accounts: accounts([["4000", "הכנסות", "40"], ["6000", "משרד", "60"], ["6100", "שכירות", "60"], ["8000", "חדש"]]),
    lines: [l("2025-06-01", "4000", -1_300_000_00), l("2025-06-01", "6000", 52_000_00), l("2025-06-01", "6100", 120_000_00), l("2025-06-01", "8000", 75_000_00)],
  };
  const opts = { performanceMateriality: 40_000_00, by: "account" as const };

  it("flags material changes, new and removed accounts, and ignores immaterial ones", () => {
    const rows = compareYears(current, prior, opts);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey["a:4000"]).toMatchObject({ change: -300_000_00, flag: "significant" });
    // גידול של 30% בהכנסות (חשבון זכות) מוצג כ־30%+
    expect(byKey["a:4000"].changePct).toBeCloseTo(30);
    expect(byKey["a:6000"].flag).toBeNull(); // 2,000 ₪ — מתחת למהותיות
    expect(byKey["a:8000"]).toMatchObject({ flag: "new", changePct: null });
    expect(byKey["a:7000"]).toMatchObject({ flag: "removed", current: 0 });
    expect(rows[0].flag).not.toBeNull();
  });

  it("does not flag a material amount that is a small percentage", () => {
    const big = {
      accounts: accounts([["4000", "הכנסות"]]),
      lines: [l("2025-01-01", "4000", -10_500_000_00)],
    };
    const base = { accounts: accounts([["4000", "הכנסות"]]), lines: [l("2024-01-01", "4000", -10_000_000_00)] };
    expect(compareYears(big, base, opts)[0]).toMatchObject({ change: -500_000_00, flag: null });
  });

  it("aggregates by trial-balance group when available", () => {
    const rows = compareYears(current, prior, { ...opts, by: "group" });
    expect(rows.find((r) => r.key === "g:60")).toMatchObject({ label: "קבוצה 60", prior: 170_000_00, current: 172_000_00 });
    // חשבון בלי קבוצה נשאר ברמת חשבון
    expect(rows.some((r) => r.key === "a:8000")).toBe(true);
  });
});

describe("monthlySpikes", () => {
  it("finds a month far above the account's usual activity", () => {
    const lines = Array.from({ length: 12 }, (_, i) => l(`2025-${String(i + 1).padStart(2, "0")}-15`, "4000", -(i === 11 ? 900_000_00 : 100_000_00 + i * 1000_00)));
    const spikes = monthlySpikes(accounts([["4000", "הכנסות"]]), lines, 50_000_00);
    expect(spikes).toHaveLength(1);
    expect(spikes[0]).toMatchObject({ accountCode: "4000", month: "2025-12", movement: -900_000_00 });
  });
  it("ignores spikes below materiality and accounts with too few months", () => {
    const lines = Array.from({ length: 12 }, (_, i) => l(`2025-${String(i + 1).padStart(2, "0")}-15`, "6000", i === 5 ? 5_000_00 : 100_00));
    expect(monthlySpikes(accounts([["6000", "משרד"]]), lines, 50_000_00)).toEqual([]);
    expect(monthlySpikes(accounts([["6000", "משרד"]]), lines.slice(0, 3), 1)).toEqual([]);
  });
});
