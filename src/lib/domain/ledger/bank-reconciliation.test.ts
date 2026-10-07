import { describe, expect, it } from "vitest";
import { reconcileBank, statementBalanceAt } from "./bank-reconciliation";
import type { LedgerLine } from "./types";
import type { BankRow } from "../bank/parse";

const book = (date: string, amount: number, entryId = date + amount): LedgerLine => ({
  entryId,
  date,
  accountCode: "1100",
  amount,
  description: "",
  reference: null,
});
const bank = (date: string, amount: number, balance: number | null = null): BankRow => ({
  date,
  description: "",
  amount,
  balance,
  reference: null,
});
const year = { from: "2025-01-01", to: "2025-12-31" };

describe("statementBalanceAt", () => {
  it("takes the last balance on or before the date", () => {
    const rows = [
      bank("2025-12-30", 100, 5000),
      bank("2025-12-31", -200, 4800),
      bank("2025-12-31", 50, 4850),
      bank("2026-01-02", 10, 4860),
    ];
    expect(statementBalanceAt(rows, "2025-12-31")).toBe(4850);
    expect(statementBalanceAt([bank("2025-12-31", 1)], "2025-12-31")).toBeNull();
  });
});

describe("reconcileBank", () => {
  it("reconciles to zero with outstanding items, a cheque cleared after year end and an unrecorded fee", () => {
    const books = [
      book("2025-03-01", 10000),
      book("2025-06-10", -2500),
      // צ'ק שנרשם בספרים ב־30/12 ונפרע בבנק רק ב־5/1
      book("2025-12-30", -4000),
      // הפקדה שנרשמה בספרים ולא הגיעה לבנק
      book("2025-12-31", 700),
    ];
    const statement = [
      bank("2025-03-03", 10000),
      bank("2025-06-12", -2500),
      // עמלה שלא נרשמה בספרים
      bank("2025-09-30", -35),
      bank("2026-01-05", -4000),
    ];
    // יתרת בנק ב־31/12: 10000 − 2500 − 35 = 7465. בספרים: 4200
    const r = reconcileBank(books, statement, { ...year, openingBookBalance: 0, bankBalance: 7465 });
    expect(r.matched.map((m) => [m.book.date, m.dayGap])).toEqual([
      ["2025-03-01", 2],
      ["2025-06-10", 2],
    ]);
    expect(r.clearedAfterYearEnd.map((m) => [m.book.amount, m.bank.date])).toEqual([[-4000, "2026-01-05"]]);
    expect(r.bookOnly.map((l) => l.amount)).toEqual([700]);
    expect(r.bankOnly.map((b) => b.amount)).toEqual([-35]);
    expect(r.bookBalance).toBe(4200);
    expect(r.inBooksNotBankTotal).toBe(-3300);
    expect(r.unexplained).toBe(0);
  });

  it("shows an unexplained difference when something does not add up", () => {
    const r = reconcileBank([book("2025-03-01", 10000)], [bank("2025-03-01", 10000)], {
      ...year,
      openingBookBalance: 0,
      bankBalance: 9000,
    });
    expect(r.unexplained).toBe(1000);
  });

  it("does not match the same bank row twice, outside the window, or to a payment made before the entry", () => {
    const r = reconcileBank(
      [book("2025-05-01", 500, "a"), book("2025-05-02", 500, "b"), book("2025-08-01", 900), book("2025-12-31", -300)],
      [bank("2025-05-01", 500), bank("2025-08-20", 900), bank("2026-04-15", -300)],
      { ...year, openingBookBalance: 0, bankBalance: null },
    );
    expect(r.matched).toHaveLength(1);
    // 900 — 19 יום, מחוץ לחלון; 300 — נפרע יותר מ־60 יום אחרי סוף השנה
    expect(r.bookOnly.map((l) => l.amount).sort((a, b) => a - b)).toEqual([-300, 500, 900]);
    expect(r.clearedAfterYearEnd).toEqual([]);
    expect(r.unexplained).toBeNull();
  });
});
