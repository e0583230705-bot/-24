import { sum, type Agorot } from "../money";
import type { LedgerAccount, LedgerLine } from "./types";

export interface TrialBalanceRow {
  code: string;
  name: string;
  opening: Agorot;
  debits: Agorot;
  credits: Agorot;
  closing: Agorot;
}

export function trialBalance(accounts: LedgerAccount[], lines: LedgerLine[]) {
  const rows = new Map<string, TrialBalanceRow>();
  for (const a of accounts) {
    rows.set(a.code, { code: a.code, name: a.name, opening: a.openingBalance, debits: 0, credits: 0, closing: a.openingBalance });
  }
  for (const l of lines) {
    let row = rows.get(l.accountCode);
    if (!row) {
      // חשבון שמופיע בפקודות אבל לא ברשימת החשבונות — עדיין נכלל, כדי שלא ייעלמו סכומים
      row = { code: l.accountCode, name: "(חשבון לא מוגדר)", opening: 0, debits: 0, credits: 0, closing: 0 };
      rows.set(l.accountCode, row);
    }
    if (l.amount >= 0) row.debits += l.amount;
    else row.credits -= l.amount;
    row.closing += l.amount;
  }
  const list = [...rows.values()].sort((a, b) => a.code.localeCompare(b.code, "he", { numeric: true }));
  const totals = {
    opening: sum(list.map((r) => r.opening)),
    debits: sum(list.map((r) => r.debits)),
    credits: sum(list.map((r) => r.credits)),
    closing: sum(list.map((r) => r.closing)),
  };
  return { rows: list, totals, balanced: totals.debits === totals.credits && totals.closing === totals.opening };
}

/** פקודות שהחובה והזכות בהן לא שווים — שגיאה יסודית בהנהלת חשבונות כפולה */
export function unbalancedEntries(lines: LedgerLine[]) {
  const byEntry = new Map<string, Agorot>();
  for (const l of lines) byEntry.set(l.entryId, (byEntry.get(l.entryId) ?? 0) + l.amount);
  return [...byEntry.entries()].filter(([, total]) => total !== 0).map(([entryId, difference]) => ({ entryId, difference }));
}
