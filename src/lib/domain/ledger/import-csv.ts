import { BankParseError, parseBankAmount, parseBankDate, parseCsv } from "../bank/parse";
import type { LedgerAccount, LedgerLine } from "./types";

/**
 * קליטת כרטסת הנהלת חשבונות שיוצאה לאקסל/CSV מתוכנת הנהלת החשבונות של הלקוח המבוקר.
 * כל שורה היא שורת פקודה: תאריך, מספר פקודה, חשבון, חובה/זכות.
 * (קובץ "מבנה אחיד" ייקלט בנפרד, לפי המפרט הרשמי, לאותו פורמט פנימי.)
 */
const HEADERS = {
  date: ["תאריך", "תאריך ערך", "תאריך אסמכתא", "date"],
  entryId: ["מספר תנועה", "מס' תנועה", "מספר פקודה", "פקודה", "תנועה", "מנה", "entry"],
  accountCode: ["מפתח חשבון", "חשבון", "מספר חשבון", "כרטיס", "account"],
  accountName: ["שם חשבון", "שם כרטיס", "account name"],
  debit: ["חובה", "debit"],
  credit: ["זכות", "credit"],
  amount: ["סכום", "amount"],
  description: ["פרטים", "תיאור", "תאור", "description"],
  reference: ["אסמכתא", "אסמכתה", "reference"],
};
type Key = keyof typeof HEADERS;

const norm = (h: string) => h.replace(/[\s‎‏]+/g, " ").trim().toLowerCase();

function detect(headers: string[]) {
  const n = headers.map(norm);
  const map: Partial<Record<Key, number>> = {};
  // שם חשבון לפני חשבון — אחרת "שם חשבון" ייתפס כקוד החשבון
  const order: Key[] = ["accountName", "date", "entryId", "accountCode", "debit", "credit", "amount", "description", "reference"];
  for (const key of order) {
    const names = HEADERS[key].map(norm);
    const idx = n.findIndex((h, i) => names.includes(h) && !Object.values(map).includes(i));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

const usable = (m: Partial<Record<Key, number>>) =>
  m.date !== undefined && m.entryId !== undefined && m.accountCode !== undefined &&
  (m.amount !== undefined || (m.debit !== undefined && m.credit !== undefined));

export function parseLedgerCsv(text: string): { accounts: LedgerAccount[]; lines: LedgerLine[]; skipped: number } {
  const table = parseCsv(text);
  const headerIndex = table.slice(0, 30).findIndex((r) => usable(detect(r)));
  if (headerIndex === -1) {
    throw new BankParseError(
      "לא זוהו העמודות הנדרשות: תאריך, מספר פקודה, חשבון, וחובה+זכות (או סכום). ודאו שזו כרטסת הנהלת חשבונות.",
    );
  }
  const map = detect(table[headerIndex]);
  const cell = (r: string[], k: Key) => (map[k] === undefined ? "" : (r[map[k]!] ?? "").trim());

  const accounts = new Map<string, LedgerAccount>();
  const lines: LedgerLine[] = [];
  let skipped = 0;
  for (const r of table.slice(headerIndex + 1)) {
    const date = parseBankDate(cell(r, "date"));
    const entryId = cell(r, "entryId");
    const accountCode = cell(r, "accountCode");
    const amount =
      map.amount !== undefined
        ? parseBankAmount(cell(r, "amount"))
        : (parseBankAmount(cell(r, "debit")) ?? 0) - Math.abs(parseBankAmount(cell(r, "credit")) ?? 0);
    if (!date || !entryId || !accountCode || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    if (!accounts.has(accountCode)) {
      accounts.set(accountCode, { code: accountCode, name: cell(r, "accountName") || accountCode, openingBalance: 0 });
    }
    lines.push({
      entryId,
      date,
      accountCode,
      amount,
      description: cell(r, "description"),
      reference: cell(r, "reference") || null,
    });
  }
  if (lines.length === 0) throw new BankParseError("לא נמצאו שורות פקודה בקובץ");
  return { accounts: [...accounts.values()], lines, skipped };
}
