import type { Agorot } from "../money";
import type { ISODate } from "../vat";
import type { BankRow } from "../bank/parse";
import type { LedgerLine } from "./types";

/**
 * התאמת בנק: תנועות חשבון הבנק בספרים מול דף הבנק, ליום סוף השנה.
 * צד חובה בחשבון הבנק בספרים (הפקדה) = זיכוי בבנק (סכום חיובי בדף הבנק), ולכן הסכומים מותאמים כפי שהם.
 *
 * הזהות שצריכה להתקיים ביום הסיום:
 *   יתרה בספרים = יתרה בבנק + רישומים בספרים שעוד לא הגיעו לבנק − תנועות בבנק שלא נרשמו בספרים
 * רישום בספרים שהופיע בבנק רק אחרי סוף השנה (למשל צ'ק שנפרע בינואר) הוא פריט פתוח ביום הסיום —
 * ויש לו ראיה: מועד הפירעון. כל מה שלא נסגר בזהות הוא "הפרש לא מוסבר".
 */

export interface ReconMatch {
  book: LedgerLine;
  bank: BankRow;
  dayGap: number;
}

export interface BankReconciliation {
  /** הותאמו בתוך השנה */
  matched: ReconMatch[];
  /** רשומים בספרים עד סוף השנה, ונפרעו בבנק רק אחריה */
  clearedAfterYearEnd: ReconMatch[];
  /** רשומים בספרים ולא נמצאו בבנק כלל */
  bookOnly: LedgerLine[];
  /** בבנק עד סוף השנה ולא נרשמו בספרים */
  bankOnly: BankRow[];
  bookBalance: Agorot;
  bankBalance: Agorot | null;
  /** סך הפריטים שבספרים ועוד לא בבנק ביום הסיום (כולל אלה שנפרעו אחריו) */
  inBooksNotBankTotal: Agorot;
  bankOnlyTotal: Agorot;
  /** null כשאין יתרת בנק */
  unexplained: Agorot | null;
}

const DAY = 24 * 60 * 60 * 1000;
const gap = (a: ISODate, b: ISODate) =>
  Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

/** יתרת הבנק בסוף התקופה: היתרה בשורה האחרונה עד תאריך הסיום (אם דף הבנק כולל עמודת יתרה) */
export function statementBalanceAt(rows: BankRow[], date: ISODate): Agorot | null {
  const withBalance = rows.filter((r) => r.balance !== null && r.date <= date);
  if (withBalance.length === 0) return null;
  const lastDate = withBalance.reduce((m, r) => (r.date > m ? r.date : m), withBalance[0].date);
  // בתוך אותו יום — השורה האחרונה בקובץ היא היתרה הסופית
  const sameDay = withBalance.filter((r) => r.date === lastDate);
  return sameDay[sameDay.length - 1].balance;
}

export function reconcileBank(
  bookLines: LedgerLine[],
  bankRows: BankRow[],
  opts: {
    from: ISODate;
    to: ISODate;
    openingBookBalance: Agorot;
    bankBalance: Agorot | null;
    /** חלון התאמה בימים בתוך השנה (ברירת מחדל 7) */
    windowDays?: number;
    /** כמה זמן אחרי סוף השנה מחפשים פירעון של פריטים פתוחים (ברירת מחדל 60 יום) */
    clearanceDays?: number;
  },
): BankReconciliation {
  const windowDays = opts.windowDays ?? 7;
  const clearanceDays = opts.clearanceDays ?? 60;
  const book = bookLines.filter((l) => l.date >= opts.from && l.date <= opts.to);
  const bank = bankRows.filter((r) => r.date >= opts.from);

  // התאמה אחד־לאחד: סכום זהה, התאריך הקרוב ביותר. סכומים גדולים קודם כדי לצמצם התאמות שגויות.
  // לתנועת בנק אחרי סוף השנה מותר פער גדול יותר — עד clearanceDays מסוף השנה
  const usedBank = new Set<number>();
  const matched: ReconMatch[] = [];
  const clearedAfterYearEnd: ReconMatch[] = [];
  const bookOnly: LedgerLine[] = [];
  const order = [...book].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.date.localeCompare(b.date));
  for (const l of order) {
    let best = -1;
    let bestGap = Infinity;
    bank.forEach((r, i) => {
      if (usedBank.has(i) || r.amount !== l.amount) return;
      const g = gap(r.date, l.date);
      const allowed = r.date > opts.to ? gap(r.date, opts.to) <= clearanceDays && r.date >= l.date : g <= windowDays;
      if (allowed && g < bestGap) {
        best = i;
        bestGap = g;
      }
    });
    if (best === -1) {
      bookOnly.push(l);
      continue;
    }
    usedBank.add(best);
    const m = { book: l, bank: bank[best], dayGap: bestGap };
    if (bank[best].date > opts.to) clearedAfterYearEnd.push(m);
    else matched.push(m);
  }
  const bankOnly = bank.filter((r, i) => !usedBank.has(i) && r.date <= opts.to);

  const bookBalance = opts.openingBookBalance + book.reduce((s, l) => s + l.amount, 0);
  const inBooksNotBankTotal =
    bookOnly.reduce((s, l) => s + l.amount, 0) + clearedAfterYearEnd.reduce((s, m) => s + m.book.amount, 0);
  const bankOnlyTotal = bankOnly.reduce((s, r) => s + r.amount, 0);
  const unexplained =
    opts.bankBalance === null ? null : bookBalance - (opts.bankBalance + inBooksNotBankTotal - bankOnlyTotal);

  const byBookDate = (a: ReconMatch, b: ReconMatch) => a.book.date.localeCompare(b.book.date);
  const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);
  return {
    matched: matched.sort(byBookDate),
    clearedAfterYearEnd: clearedAfterYearEnd.sort(byBookDate),
    bookOnly: bookOnly.sort(byDate),
    bankOnly: bankOnly.sort(byDate),
    bookBalance,
    bankBalance: opts.bankBalance,
    inBooksNotBankTotal,
    bankOnlyTotal,
    unexplained,
  };
}
