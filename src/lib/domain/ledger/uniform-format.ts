import type { Agorot } from "../money";
import type { LedgerAccount, LedgerLine } from "./types";

/**
 * קליטת "קובץ במבנה אחיד" (OPENFRMT) לפי הוראות רשות המסים, גרסה 1.31.
 * כל תוכנת הנהלת חשבונות רשומה בישראל חייבת לייצא אותו, ולכן זה מקור הנתונים המועדף לביקורת.
 *
 * הקבצים: INI.TXT (רשומה מובילה A000 ורשומות סיכום) ו־BKMVDATA.TXT (A100, B100, B110, C100, D110, D120, M100, Z900).
 * רשומות באורך קבוע, מופרדות ב־CRLF. העמודות במפרט ממוספרות מ־1.
 * כאן נקלטות הרשומות שהביקורת צריכה: B110 (חשבונות) ו־B100 (תנועות).
 */

export class UniformFormatError extends Error {}

/** שדה לפי עמודות המפרט (כולל שני הקצוות) */
const field = (line: string, from: number, to: number) => line.slice(from - 1, to).trim();

/** סכום בפורמט X9(12)v99: סימן ואחריו 14 ספרות, שתיים אחרונות אחרי הנקודה. מחזיר אגורות */
export function parseUniformAmount(raw: string): Agorot | null {
  const s = raw.trim();
  if (s === "") return 0;
  const m = s.match(/^([+-]?)(\d+)$/);
  if (!m) return null;
  const value = Number(m[2]);
  return m[1] === "-" ? -value : value;
}

/** תאריך YYYYMMDD → YYYY-MM-DD */
export function parseUniformDate(raw: string): string | null {
  const s = raw.trim();
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * קידוד: לפי המפרט ISO-8859-8-i (Windows) או CP-862 (DOS). ב־CP-862 האותיות א–ת הן הבתים 0x80–0x9A.
 * Windows-1255 מכיל את ISO-8859-8 לגבי האותיות, ולכן הוא משמש לפענוח של הסוג הראשון.
 */
export function decodeUniform(bytes: Uint8Array, charset?: "iso-8859-8" | "cp862"): string {
  // לא לפי המפרט, אבל יש תוכנות שמייצאות UTF-8. קובץ בקידוד של בית אחד כמעט אף פעם אינו UTF-8 תקין
  if (!charset) {
    try {
      const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[^\x00-\x7f]/.test(utf8)) return utf8;
    } catch {
      // לא UTF-8 — ממשיכים לקידודים שבמפרט
    }
  }
  const looksDos = () => {
    let dos = 0;
    let win = 0;
    for (const b of bytes.subarray(0, 200_000)) {
      if (b >= 0x80 && b <= 0x9a) dos++;
      else if (b >= 0xe0 && b <= 0xfa) win++;
    }
    return dos > win;
  };
  if (charset === "cp862" || (!charset && looksDos())) {
    let out = "";
    for (const b of bytes) out += b >= 0x80 && b <= 0x9a ? String.fromCharCode(0x05d0 + b - 0x80) : b < 0x80 ? String.fromCharCode(b) : "?";
    return out;
  }
  return new TextDecoder("windows-1255").decode(bytes);
}

const lines = (text: string) => text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");

export interface IniInfo {
  businessTaxId: string;
  mainId: string;
  softwareRegistration: string;
  softwareName: string;
  businessName: string;
  taxYear: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  charset: "iso-8859-8" | "cp862" | null;
  totalRecords: number;
  /** סך רשומות לפי סוג, מרשומות הסיכום */
  counts: Record<string, number>;
}

export function parseIni(text: string): IniInfo {
  const [first, ...rest] = lines(text);
  if (!first?.startsWith("A000")) throw new UniformFormatError("קובץ INI.TXT לא תקין: חסרה רשומה מובילה A000");
  const counts: Record<string, number> = {};
  for (const l of rest) {
    const code = field(l, 1, 4);
    if (/^[A-Z]\d{3}$/.test(code)) counts[code] = Number(field(l, 5, 19)) || 0;
  }
  const charsetCode = field(first, 396, 396);
  return {
    totalRecords: Number(field(first, 10, 24)) || 0,
    businessTaxId: field(first, 25, 33),
    mainId: field(first, 34, 48),
    softwareRegistration: field(first, 57, 64),
    softwareName: field(first, 65, 84),
    businessName: field(first, 215, 264),
    taxYear: field(first, 363, 366),
    rangeFrom: parseUniformDate(field(first, 367, 374)),
    rangeTo: parseUniformDate(field(first, 375, 382)),
    charset: charsetCode === "1" ? "iso-8859-8" : charsetCode === "2" ? "cp862" : null,
    counts,
  };
}

export interface UniformAccount extends LedgerAccount {
  trialBalanceCode: string;
  trialBalanceName: string;
  /** קוד סיווג חשבונאי (טופס 6111) */
  classification: string;
  /** סך חובה / זכות כפי שדווחו ב־B110 — לבדיקת התאמה מול התנועות */
  reportedDebits: Agorot;
  reportedCredits: Agorot;
}

export interface UniformIssue {
  severity: "error" | "warning";
  message: string;
}

export interface BkmvResult {
  businessTaxId: string;
  mainId: string;
  accounts: UniformAccount[];
  lines: (LedgerLine & { lineNo: number; entryDate: string | null })[];
  counts: Record<string, number>;
  issues: UniformIssue[];
}

/**
 * פענוח BKMVDATA.TXT. בנוסף לנתונים, מחזיר בעיות שלמות שנמצאו בקובץ עצמו —
 * גם הן ממצאי ביקורת (מספור רשומות שבור, סכומים שלא תואמים לאינדקס החשבונות וכו').
 */
export function parseBkmvdata(text: string): BkmvResult {
  const all = lines(text);
  if (!all[0]?.startsWith("A100")) throw new UniformFormatError("קובץ BKMVDATA.TXT לא תקין: הרשומה הראשונה אינה רשומת פתיחה A100");
  const issues: UniformIssue[] = [];
  const counts: Record<string, number> = {};
  const accounts: UniformAccount[] = [];
  const out: BkmvResult["lines"] = [];
  const businessTaxId = field(all[0], 14, 22);
  const mainId = field(all[0], 23, 37);
  let expectedRecordNo = 1;
  let badAmounts = 0;
  let badDates = 0;
  let closing: string | null = null;

  for (const l of all) {
    const code = field(l, 1, 4);
    counts[code] = (counts[code] ?? 0) + 1;
    const recordNo = Number(field(l, 5, 13));
    if (recordNo !== expectedRecordNo) {
      if (issues.filter((i) => i.message.startsWith("מספור")).length === 0) {
        issues.push({
          severity: "warning",
          message: `מספור הרשומות בקובץ אינו רציף (ציפינו ל־${expectedRecordNo}, נמצא ${recordNo})`,
        });
      }
      expectedRecordNo = recordNo;
    }
    expectedRecordNo++;

    if (code === "B110") {
      const opening = parseUniformAmount(field(l, 278, 292));
      const debits = parseUniformAmount(field(l, 293, 307));
      const credits = parseUniformAmount(field(l, 308, 322));
      if (opening === null || debits === null || credits === null) badAmounts++;
      accounts.push({
        code: field(l, 23, 37),
        name: field(l, 38, 87) || field(l, 23, 37),
        openingBalance: opening ?? 0,
        trialBalanceCode: field(l, 88, 102),
        trialBalanceName: field(l, 103, 132),
        classification: field(l, 323, 326),
        reportedDebits: debits ?? 0,
        reportedCredits: credits ?? 0,
      });
    } else if (code === "B100") {
      const date = parseUniformDate(field(l, 157, 164));
      const value = parseUniformAmount(field(l, 207, 221));
      const side = field(l, 203, 203);
      if (!date) badDates++;
      if (value === null || (side !== "1" && side !== "2")) badAmounts++;
      if (!date || value === null || (side !== "1" && side !== "2")) continue;
      out.push({
        entryId: field(l, 23, 32).replace(/^0+(?=\d)/, ""),
        lineNo: Number(field(l, 33, 37)) || 0,
        date,
        accountCode: field(l, 173, 187),
        // 1 = חובה, 2 = זכות. ערך שלילי בשדה הסכום מקטין את אותו צד (לפי סעיף 2.4 יא)
        amount: side === "1" ? value : -value,
        description: field(l, 107, 156),
        reference: field(l, 61, 80) || null,
        entryDate: parseUniformDate(field(l, 276, 283)),
      });
    } else if (code === "Z900") {
      closing = l;
    }
  }

  if (!closing) {
    issues.push({ severity: "error", message: "חסרה רשומת סגירה Z900 — ייתכן שהקובץ קטוע" });
  } else {
    const declared = Number(field(closing, 46, 60));
    if (declared && declared !== all.length) {
      issues.push({ severity: "error", message: `רשומת הסגירה מצהירה על ${declared} רשומות, ובקובץ יש ${all.length}` });
    }
  }
  if (badDates) issues.push({ severity: "error", message: `${badDates} תנועות עם תאריך לא תקין — לא נקלטו` });
  if (badAmounts) issues.push({ severity: "error", message: `${badAmounts} רשומות עם סכום או סימן חובה/זכות לא תקינים` });

  // התאמה בין סכומי האינדקס (B110) לבין התנועות (B100) — אי־התאמה מעידה על קובץ חלקי או על בעיה בתוכנה
  const moved = new Map<string, { d: number; c: number }>();
  for (const x of out) {
    const m = moved.get(x.accountCode) ?? { d: 0, c: 0 };
    if (x.amount >= 0) m.d += x.amount;
    else m.c -= x.amount;
    moved.set(x.accountCode, m);
  }
  const mismatched = accounts.filter((a) => {
    const m = moved.get(a.code) ?? { d: 0, c: 0 };
    return m.d !== a.reportedDebits || m.c !== a.reportedCredits;
  });
  if (mismatched.length > 0) {
    issues.push({
      severity: "warning",
      message: `ב־${mismatched.length} חשבונות סך החובה/זכות באינדקס החשבונות לא תואם לסכום התנועות (למשל ${mismatched
        .slice(0, 3)
        .map((a) => a.code)
        .join(", ")})`,
    });
  }
  const known = new Set(accounts.map((a) => a.code));
  const unknown = new Set(out.filter((x) => !known.has(x.accountCode)).map((x) => x.accountCode));
  if (accounts.length > 0 && unknown.size > 0) {
    issues.push({ severity: "warning", message: `${unknown.size} חשבונות מופיעים בתנועות אבל לא באינדקס החשבונות` });
  }
  if (out.length === 0) issues.push({ severity: "warning", message: "בקובץ אין תנועות הנהלת חשבונות (B100)" });

  return { businessTaxId, mainId, accounts, lines: out, counts, issues };
}

/** השוואה בין רשומות הסיכום ב־INI לבין מה שנמצא בפועל ב־BKMVDATA */
export function crossCheckIni(ini: IniInfo, bkmv: BkmvResult): UniformIssue[] {
  const issues: UniformIssue[] = [];
  if (ini.mainId && bkmv.mainId && ini.mainId !== bkmv.mainId) {
    issues.push({ severity: "error", message: "המזהה הראשי ב־INI.TXT שונה מזה שב־BKMVDATA.TXT — ייתכן שהקבצים מהפקות שונות" });
  }
  for (const [code, declared] of Object.entries(ini.counts)) {
    const actual = bkmv.counts[code] ?? 0;
    if (declared !== actual) {
      issues.push({ severity: "error", message: `INI.TXT מצהיר על ${declared} רשומות ${code}, ובקובץ הנתונים יש ${actual}` });
    }
  }
  return issues;
}
