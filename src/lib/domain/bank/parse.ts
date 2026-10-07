import type { Agorot } from "../money";
import type { ISODate } from "../vat";

/**
 * קריאת קובץ תנועות שיוצא מאתר הבנק (CSV).
 * בנקים בישראל מייצאים בפורמטים שונים, ולכן מזהים את העמודות לפי הכותרות
 * ולא לפי מיקום קבוע. קבצים רבים מגיעים בקידוד Windows-1255 ולא UTF-8.
 */

export interface BankRow {
  date: ISODate;
  description: string;
  /** חיובי — זיכוי (כסף נכנס); שלילי — חובה (כסף יוצא) */
  amount: Agorot;
  balance: Agorot | null;
  reference: string | null;
}

export class BankParseError extends Error {}

export function decodeBankFile(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1255").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

/** מפרק CSV עם תמיכה במרכאות, ומזהה מפריד: פסיק, נקודה־פסיק או טאב */
export function parseCsv(text: string): string[][] {
  const firstLines = text.split(/\r?\n/).slice(0, 20).join("\n");
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLines.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      // מרכאות פותחות רק בתחילת שדה; באמצע שדה הן חלק מהטקסט (למשל ש"ח, בע"מ)
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

/** "1,234.50" / "-1,234.50" / "(1,234.50)" / "1,234.50-" / "₪ 99" → אגורות */
export function parseBankAmount(raw: string): Agorot | null {
  let s = raw.replace(/[₪\s‎‏]/g, "").replace(/,/g, "");
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Math.round(Number(s) * 100);
  return negative ? -value : value;
}

/** dd/mm/yyyy, dd/mm/yy, dd.mm.yyyy, dd-mm-yyyy או yyyy-mm-dd */
export function parseBankDate(raw: string): ISODate | null {
  const s = raw.trim().split(/\s+/)[0];
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const HEADERS = {
  date: ["תאריך", "תאריך ערך", "תאריך פעולה", "date"],
  description: ["תיאור", "הפעולה", "תיאור הפעולה", "פרטים", "תאור", "description"],
  debit: ["חובה", "בחובה", "debit"],
  credit: ["זכות", "בזכות", "credit"],
  amount: ["סכום", "סכום הפעולה", "₪ זכות/חובה", "זכות/חובה", "amount"],
  balance: ["יתרה", "יתרה בש\"ח", "יתרה בשח", "balance"],
  reference: ["אסמכתא", "אסמכתה", "מספר אסמכתא", "reference"],
};

type ColumnKey = keyof typeof HEADERS;
export type ColumnMap = Partial<Record<ColumnKey, number>>;

const normalizeHeader = (h: string) => h.replace(/[\s‎‏]+/g, " ").trim().toLowerCase();

export function detectColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const key of Object.keys(HEADERS) as ColumnKey[]) {
    // התאמה מדויקת קודם, ואז כותרת שמתחילה במילה (למשל "תאריך ערך" כשאין "תאריך")
    const names = HEADERS[key].map(normalizeHeader);
    let idx = normalized.findIndex((h) => names.includes(h));
    if (idx === -1) idx = normalized.findIndex((h) => names.some((n) => h.startsWith(n)));
    if (idx !== -1 && !Object.values(map).includes(idx)) map[key] = idx;
  }
  return map;
}

function isUsable(map: ColumnMap) {
  return map.date !== undefined && map.description !== undefined &&
    (map.amount !== undefined || map.debit !== undefined || map.credit !== undefined);
}

export function parseBankStatement(text: string): { rows: BankRow[]; skipped: number } {
  const table = parseCsv(text);
  // בקבצי בנק יש לפעמים שורות פתיחה (שם חשבון, טווח תאריכים) לפני הכותרות
  const headerIndex = table.slice(0, 30).findIndex((r) => isUsable(detectColumns(r)));
  if (headerIndex === -1) {
    throw new BankParseError(
      "לא זוהו עמודות של תאריך, תיאור וסכום (או חובה/זכות). ודאו שזה קובץ תנועות שיוצא מאתר הבנק בפורמט CSV.",
    );
  }
  const map = detectColumns(table[headerIndex]);
  const cell = (r: string[], key: ColumnKey) => (map[key] === undefined ? "" : (r[map[key]!] ?? ""));

  const rows: BankRow[] = [];
  let skipped = 0;
  for (const r of table.slice(headerIndex + 1)) {
    const date = parseBankDate(cell(r, "date"));
    let amount: Agorot | null = null;
    if (map.amount !== undefined) {
      amount = parseBankAmount(cell(r, "amount"));
    } else {
      const credit = parseBankAmount(cell(r, "credit")) ?? 0;
      const debit = parseBankAmount(cell(r, "debit")) ?? 0;
      amount = credit - Math.abs(debit);
    }
    // שורות סיכום, יתרת פתיחה ושורות ריקות — מדלגים
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      description: cell(r, "description") || "ללא תיאור",
      amount,
      balance: parseBankAmount(cell(r, "balance")),
      reference: cell(r, "reference") || null,
    });
  }
  if (rows.length === 0) throw new BankParseError("לא נמצאו תנועות בקובץ");
  return { rows, skipped };
}

/**
 * טביעת אצבע לזיהוי כפילויות כשמייבאים קבצים חופפים.
 * שתי תנועות זהות לגמרי באותו יום (למשל שני קפה) מובחנות לפי מספר ההופעה.
 */
export function fingerprints(rows: BankRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.date, r.amount, r.description, r.reference ?? "", r.balance ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}
