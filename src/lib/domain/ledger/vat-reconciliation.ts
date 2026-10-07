import type { Agorot } from "../money";
import { vatRateOn } from "../vat";
import type { LedgerAccount, LedgerLine } from "./types";

/**
 * בדיקת סבירות מע"מ עסקאות: לכל חודש, ההכנסות בספרים כפול שיעור המע"מ באותו חודש,
 * מול המע"מ שנרשם בפועל בחשבון מע"מ עסקאות. פער מעיד על הכנסה שנרשמה בלי מע"מ,
 * על מע"מ שלא נרשם — או על הכנסות פטורות / בשיעור אפס (יצוא), שאז צריך הסבר.
 */

export interface VatMonth {
  month: string; // YYYY-MM
  revenue: Agorot;
  rate: number;
  expectedVat: Agorot;
  recordedVat: Agorot;
  difference: Agorot;
  flagged: boolean;
}

/** חשבונות שנראים לפי השם כמו הכנסות / מע"מ עסקאות — הצעה בלבד, רואה החשבון בוחר */
export function suggestVatAccounts(accounts: LedgerAccount[]) {
  const name = (a: LedgerAccount) => a.name.replace(/["״׳']/g, "");
  return {
    revenue: accounts.filter((a) => /הכנסות|מכירות|הכנסה/.test(a.name) && !/מעמ|מע מ/.test(name(a))).map((a) => a.code),
    outputVat: accounts.filter((a) => /מעמ עסקאות|מע מ עסקאות|מעמ על מכירות/.test(name(a))).map((a) => a.code),
  };
}

export function vatReasonableness(
  lines: LedgerLine[],
  opts: { revenueAccounts: string[]; outputVatAccounts: string[]; tolerance: Agorot; from: string; to: string },
): VatMonth[] {
  const revenue = new Set(opts.revenueAccounts);
  const vat = new Set(opts.outputVatAccounts);
  const months = new Map<string, { revenue: Agorot; vat: Agorot }>();
  for (const l of lines) {
    if (l.date < opts.from || l.date > opts.to) continue;
    const isRevenue = revenue.has(l.accountCode);
    const isVat = vat.has(l.accountCode);
    if (!isRevenue && !isVat) continue;
    const m = months.get(l.date.slice(0, 7)) ?? { revenue: 0, vat: 0 };
    // הכנסות ומע"מ עסקאות הם חשבונות זכות — הופכים סימן כדי לקבל סכום חיובי
    if (isRevenue) m.revenue -= l.amount;
    if (isVat) m.vat -= l.amount;
    months.set(l.date.slice(0, 7), m);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      const rate = vatRateOn(`${month}-15`);
      const expectedVat = Math.round((m.revenue * rate) / 100);
      const difference = m.vat - expectedVat;
      return {
        month,
        revenue: m.revenue,
        rate,
        expectedVat,
        recordedVat: m.vat,
        difference,
        flagged: Math.abs(difference) > opts.tolerance,
      };
    });
}
