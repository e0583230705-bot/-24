import type { Agorot } from "../money";
import type { ISODate } from "../vat";
import type { LedgerLine } from "./types";

/**
 * בדיקת פקודות יומן (Journal Entry Testing): מאפיינים שמעלים סיכון לטעות או להטעיה.
 * דגל אינו הוכחה לבעיה — הוא מכוון את רואה החשבון לאן להסתכל.
 */
export type JournalFlag =
  | "weekend"
  | "round_amount"
  | "near_year_end"
  | "after_year_end"
  | "no_description"
  | "large_amount"
  | "duplicate";

export const FLAG_LABELS: Record<JournalFlag, string> = {
  weekend: "נרשמה בשבת",
  round_amount: "סכום עגול",
  near_year_end: "סמוך לסוף השנה",
  after_year_end: "אחרי סוף השנה",
  no_description: "בלי תיאור",
  large_amount: "סכום גבוה מהמהותיות",
  duplicate: "פקודה כפולה",
};

export interface JournalTestOptions {
  yearEnd: ISODate;
  /** סף מהותיות לביצוע; שורות מעליו מסומנות */
  performanceMateriality: Agorot;
  /** כמה ימים לפני סוף השנה נחשבים "סמוך" */
  nearYearEndDays?: number;
  /** סכום עגול: מתחלק בסכום הזה ללא שארית (ברירת מחדל 1,000 ₪) */
  roundTo?: Agorot;
}

export interface FlaggedEntry {
  entryId: string;
  date: ISODate;
  total: Agorot;
  description: string;
  flags: JournalFlag[];
}

const DAY = 24 * 60 * 60 * 1000;

export function testJournalEntries(lines: LedgerLine[], opts: JournalTestOptions): FlaggedEntry[] {
  const roundTo = opts.roundTo ?? 1000_00;
  const nearDays = opts.nearYearEndDays ?? 5;
  const yearEndMs = Date.parse(`${opts.yearEnd}T00:00:00Z`);

  const entries = new Map<string, LedgerLine[]>();
  for (const l of lines) entries.set(l.entryId, [...(entries.get(l.entryId) ?? []), l]);

  // טביעת אצבע של פקודה: תאריך, ותוכן השורות (חשבון וסכום) ממוין
  const signature = (ls: LedgerLine[]) =>
    ls[0].date + "|" + ls.map((l) => `${l.accountCode}:${l.amount}`).sort().join(";");
  const signatures = new Map<string, number>();
  for (const ls of entries.values()) signatures.set(signature(ls), (signatures.get(signature(ls)) ?? 0) + 1);

  const result: FlaggedEntry[] = [];
  for (const [entryId, ls] of entries) {
    const date = ls[0].date;
    const total = ls.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const flags: JournalFlag[] = [];
    const ms = Date.parse(`${date}T00:00:00Z`);
    if (new Date(ms).getUTCDay() === 6) flags.push("weekend");
    if (total >= roundTo && total % roundTo === 0) flags.push("round_amount");
    if (ms > yearEndMs) flags.push("after_year_end");
    else if ((yearEndMs - ms) / DAY < nearDays) flags.push("near_year_end");
    if (ls.every((l) => !l.description.trim())) flags.push("no_description");
    if (total >= opts.performanceMateriality) flags.push("large_amount");
    if ((signatures.get(signature(ls)) ?? 0) > 1) flags.push("duplicate");
    if (flags.length > 0) {
      result.push({ entryId, date, total, description: ls.find((l) => l.description.trim())?.description ?? "", flags });
    }
  }
  // הכי הרבה דגלים קודם, ואז הסכום הגבוה
  return result.sort((a, b) => b.flags.length - a.flags.length || b.total - a.total);
}
