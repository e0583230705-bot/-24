import type { Agorot } from "../money";
import { decodeBankFile, parseBankAmount, parseBankDate, parseCsv } from "../bank/parse";
import type { PayrollIssue } from "./types";

/**
 * "ריכוז שכר" / תלושים חודשיים מתוכנת השכר של הלקוח: שורה לכל עובד־חודש, בקובץ אקסל או CSV.
 * לתוכנות השכר אין פורמט ייצוא אחיד, ולכן הקובץ נשמר כפי שהוא (כותרות + שורות), והמיפוי של העמודות
 * לשדות הקנוניים נעשה אוטומטית לפי הכותרות ומתוקן ידנית. שינוי מיפוי לא דורש העלאה מחדש.
 */

export class PayslipParseError extends Error {}

export interface PayslipTable {
  headers: string[];
  /** ערכים כמחרוזות, כפי שבקובץ */
  rows: string[][];
  sheet: string | null;
}

export type PayslipField =
  | "taxId"
  | "employeeNo"
  | "name"
  | "firstName"
  | "lastName"
  | "month"
  | "startDate"
  | "endDate"
  | "jobPercent"
  | "hours"
  | "overtimeHours"
  | "hourlyRate"
  | "baseSalary"
  | "overtimePay"
  | "gross"
  | "taxableGross"
  | "niWages"
  | "incomeTax"
  | "niEmployee"
  | "healthEmployee"
  | "pensionEmployee"
  | "studyFundEmployee"
  | "otherDeductions"
  | "totalDeductions"
  | "net"
  | "pensionEmployer"
  | "severanceEmployer"
  | "studyFundEmployer"
  | "niEmployer"
  | "employerCost"
  | "recuperationPay"
  | "vacationBalance"
  | "sickBalance"
  | "bankAccount"
  | "department";

export type PayslipColumnMap = Partial<Record<PayslipField, number>>;

interface FieldDef {
  label: string;
  kind: "text" | "money" | "number" | "month" | "date";
  required?: boolean;
  /** ביטויים לזיהוי הכותרת (אחרי ניקוי) — הסדר קובע עדיפות */
  match: RegExp[];
}

const rx = (...parts: string[]) => parts.map((p) => new RegExp(p));

export const PAYSLIP_FIELDS: Record<PayslipField, FieldDef> = {
  taxId: { label: "מספר זהות", kind: "text", required: true, match: rx("^(ת ?ז|תעודת זהות|מספר זהות|מס זהות|ת\\.?ז\\.?|זהות|id)$", "זהות|ת ז|^id") },
  employeeNo: { label: "מספר עובד", kind: "text", match: rx("מס(פר)? עובד|מספר אישי|קוד עובד") },
  name: { label: "שם העובד", kind: "text", match: rx("^שם( העובד| עובד| מלא)?$", "^שם$") },
  firstName: { label: "שם פרטי", kind: "text", match: rx("שם פרטי|פרטי") },
  lastName: { label: "שם משפחה", kind: "text", match: rx("שם משפחה|משפחה") },
  month: { label: "חודש שכר", kind: "month", required: true, match: rx("חודש( שכר| משכורת| עבודה| תשלום)?$", "^חודש|תקופה|period|month") },
  startDate: { label: "תאריך תחילה", kind: "date", match: rx("תחילת (עבודה|העסקה)|תאריך (תחילה|קליטה|כניסה)|ותק מ") },
  endDate: { label: "תאריך סיום", kind: "date", match: rx("סיום (עבודה|העסקה)|תאריך (סיום|עזיבה|פרישה)") },
  jobPercent: { label: "אחוז משרה", kind: "number", match: rx("אחוז משרה|היקף משרה|חלקיות|% משרה") },
  hours: { label: "שעות עבודה", kind: "number", match: rx("^שעות( עבודה| רגילות| בפועל)?$", "שעות רגילות|סה כ שעות|שעות עבודה") },
  overtimeHours: { label: "שעות נוספות (כמות)", kind: "number", match: rx("שעות נוספות(?! ש)|ש נ(?! ש)|שעות 125|שעות 150|כמות ש נ") },
  hourlyRate: { label: "ערך שעה", kind: "money", match: rx("ערך שעה|תעריף שעה|שכר שעה|שכר לשעה") },
  baseSalary: { label: "שכר יסוד", kind: "money", match: rx("שכר יסוד|משכורת יסוד|שכר בסיס|יסוד|שכר רגיל|משכורת בסיס") },
  overtimePay: { label: "תשלום שעות נוספות", kind: "money", match: rx("תשלום ש נ|גמול שעות נוספות|שעות נוספות ש ח|סכום שעות נוספות|ש נ ש ח") },
  gross: { label: "ברוטו", kind: "money", required: true, match: rx("^(סה כ )?ברוטו( לתשלום| כולל)?$", "^שכר ברוטו$", "ברוטו(?! למס)(?! לב)(?! ל)", "סה כ תשלומים") },
  taxableGross: { label: "ברוטו למס", kind: "money", match: rx("ברוטו למס|חייב מס|חייב במס|שכר למס") },
  niWages: { label: "ברוטו לביטוח לאומי", kind: "money", match: rx("ברוטו לב ?ל|ברוטו לביטוח לאומי|חייב ב ?ל|שכר לביטוח לאומי|חייב ביטוח לאומי") },
  incomeTax: { label: "מס הכנסה", kind: "money", match: rx("^מס הכנסה$", "מס הכנסה|ניכוי מס|מ ה$") },
  niEmployee: { label: "ביטוח לאומי עובד", kind: "money", match: rx("ביטוח לאומי( עובד)?$|ב ל( עובד)?$|ביטוח לאומי עובד|בטוח לאומי עובד|ניכוי ב ל") },
  healthEmployee: { label: "דמי בריאות", kind: "money", match: rx("בריאות|מס בריאות|ביטוח בריאות") },
  pensionEmployee: { label: "פנסיה עובד", kind: "money", match: rx("(פנסיה|גמל|תגמולים|קופ ג|קופת גמל|מבטחים|ביטוח מנהלים)( |-)?(עובד|ע)$", "גמל עובד|פנסיה עובד|תגמולי עובד|תגמולים עובד") },
  studyFundEmployee: { label: "קרן השתלמות עובד", kind: "money", match: rx("(השתלמות|קה ל|קרן השתלמות)( |-)?(עובד|ע)$", "השתלמות עובד|קה ל עובד") },
  otherDeductions: { label: "ניכויים אחרים", kind: "money", match: rx("ניכויי(ם)? (רשות|אחרים|שונים)|הלוואה|מקדמה|ניכוי אחר") },
  totalDeductions: { label: "סה״כ ניכויים", kind: "money", match: rx("סה כ ניכויים|סך ניכויים|ניכויי חובה|^ניכויים$") },
  net: { label: "נטו לתשלום", kind: "money", required: true, match: rx("^נטו( לתשלום)?$", "נטו לתשלום|שכר נטו|^נטו") },
  pensionEmployer: { label: "פנסיה מעסיק (תגמולים)", kind: "money", match: rx("(פנסיה|גמל|תגמולים|קופ ג|קופת גמל|מבטחים|ביטוח מנהלים)( |-)?(מעסיק|מעביד|מ)$", "גמל מעסיק|גמל מעביד|פנסיה מעסיק|פנסיה מעביד|תגמולי מעסיק|תגמולי מעביד|תגמולים מעסיק|תגמולים מעביד") },
  severanceEmployer: { label: "פיצויים (הפרשת מעסיק)", kind: "money", match: rx("פיצויים|פצויים|קרן פיצויים") },
  studyFundEmployer: { label: "קרן השתלמות מעסיק", kind: "money", match: rx("(השתלמות|קה ל|קרן השתלמות)( |-)?(מעסיק|מעביד|מ)$", "השתלמות מעסיק|השתלמות מעביד|קה ל מעסיק|קה ל מעביד") },
  niEmployer: { label: "ביטוח לאומי מעסיק", kind: "money", match: rx("ביטוח לאומי (מעסיק|מעביד)|ב ל (מעסיק|מעביד)|בטוח לאומי (מעסיק|מעביד)") },
  employerCost: { label: "עלות מעסיק", kind: "money", match: rx("עלות (מעסיק|מעביד|שכר|כוללת)|סה כ עלות") },
  recuperationPay: { label: "דמי הבראה (תשלום)", kind: "money", match: rx("^(דמי |תשלום )?הבראה$", "דמי הבראה|תשלום הבראה") },
  vacationBalance: { label: "יתרת חופשה", kind: "number", match: rx("יתרת חופשה|חופשה יתרה|יתרה חופשה|ימי חופשה צבורים|צבירת חופשה") },
  sickBalance: { label: "יתרת מחלה", kind: "number", match: rx("יתרת מחלה|מחלה יתרה|ימי מחלה צבורים") },
  bankAccount: { label: "חשבון בנק", kind: "text", match: rx("חשבון בנק|מס חשבון|מספר חשבון|בנק סניף חשבון|^חשבון$") },
  department: { label: "מחלקה", kind: "text", match: rx("מחלקה|מרכז עלות|יחידה|אגף") },
};

export const cleanHeader = (h: string) =>
  h
    .replace(/["״׳'`]/g, " ")
    .replace(/[()\[\]:/\\.,\-–_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** הצעת מיפוי אוטומטית: לכל שדה — העמודה הראשונה שכותרתה מתאימה, לפי סדר העדיפות של הביטויים. עמודה משויכת פעם אחת */
export function autoMapColumns(headers: string[]): PayslipColumnMap {
  const cleaned = headers.map(cleanHeader);
  const map: PayslipColumnMap = {};
  const used = new Set<number>();
  // שדות ספציפיים לפני כלליים: למשל "ברוטו למס" לפני "ברוטו", "ביטוח לאומי מעסיק" לפני "ביטוח לאומי"
  const order: PayslipField[] = [
    "taxId", "employeeNo", "firstName", "lastName", "name", "month", "startDate", "endDate", "jobPercent",
    "overtimeHours", "hours", "hourlyRate", "overtimePay", "baseSalary", "taxableGross", "niWages",
    "niEmployer", "pensionEmployer", "studyFundEmployer", "severanceEmployer", "employerCost",
    "pensionEmployee", "studyFundEmployee", "healthEmployee", "niEmployee", "incomeTax",
    "totalDeductions", "otherDeductions", "net", "gross", "recuperationPay", "vacationBalance", "sickBalance", "bankAccount", "department",
  ];
  for (const field of order) {
    for (const pattern of PAYSLIP_FIELDS[field].match) {
      const idx = cleaned.findIndex((h, i) => !used.has(i) && h !== "" && pattern.test(h));
      if (idx >= 0) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

export function missingRequiredFields(map: PayslipColumnMap): PayslipField[] {
  return (Object.keys(PAYSLIP_FIELDS) as PayslipField[]).filter((f) => PAYSLIP_FIELDS[f].required && map[f] === undefined);
}

/* ---------- קריאת הקובץ ---------- */

const isXlsx = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b; // PK — zip
const isXls = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf; // OLE2

/** קורא אקסל (xlsx / xls) או CSV לטבלת מחרוזות. שורת הכותרת = השורה הראשונה עם לפחות 3 תאים לא ריקים */
export async function parsePayslipTable(bytes: Uint8Array, filename: string): Promise<PayslipTable> {
  let grid: string[][];
  let sheet: string | null = null;
  if (isXlsx(bytes) || isXls(bytes) || /\.xlsx?$/i.test(filename)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
    // הגיליון עם הכי הרבה שורות — בדרך כלל הנתונים
    let best: { name: string; rows: unknown[][] } | null = null;
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false });
      if (!best || rows.length > best.rows.length) best = { name, rows };
    }
    if (!best) throw new PayslipParseError("קובץ האקסל ריק");
    sheet = best.name;
    grid = best.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).trim())));
  } else {
    grid = parseCsv(decodeBankFile(bytes)).map((r) => r.map((c) => c.trim()));
  }
  const headerIdx = grid.findIndex((r) => r.filter((c) => c !== "").length >= 3);
  if (headerIdx < 0) throw new PayslipParseError("לא נמצאה שורת כותרות (שורה עם לפחות שלוש עמודות)");
  const headers = grid[headerIdx].map((h) => h.replace(/\s+/g, " ").trim());
  const width = headers.length;
  const rows = grid
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  if (rows.length === 0) throw new PayslipParseError("אין שורות נתונים אחרי הכותרות");
  return { headers, rows, sheet };
}

/* ---------- נרמול לשדות קנוניים ---------- */

export interface PayslipRow {
  taxId: string;
  employeeNo: string | null;
  name: string;
  month: string;
  startDate: string | null;
  endDate: string | null;
  jobPercent: number | null;
  hours: number | null;
  overtimeHours: number | null;
  hourlyRate: Agorot | null;
  baseSalary: Agorot | null;
  overtimePay: Agorot | null;
  gross: Agorot;
  taxableGross: Agorot | null;
  niWages: Agorot | null;
  incomeTax: Agorot | null;
  niEmployee: Agorot | null;
  healthEmployee: Agorot | null;
  pensionEmployee: Agorot | null;
  studyFundEmployee: Agorot | null;
  otherDeductions: Agorot | null;
  totalDeductions: Agorot | null;
  net: Agorot;
  pensionEmployer: Agorot | null;
  severanceEmployer: Agorot | null;
  studyFundEmployer: Agorot | null;
  niEmployer: Agorot | null;
  employerCost: Agorot | null;
  /** דמי הבראה ששולמו בתלוש */
  recuperationPay: Agorot | null;
  vacationBalance: number | null;
  sickBalance: number | null;
  bankAccount: string | null;
  department: string | null;
  /** מספר השורה בקובץ (1 = השורה הראשונה אחרי הכותרת) */
  line: number;
}

const HEBREW_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/** חודש שכר: 01/2025, 1.2025, 2025-01, 202501, ינואר 2025, 01/01/2025 (תאריך בתוך החודש), או מספר סידורי של אקסל */
export function parsePayslipMonth(raw: string, hintYear?: number): string | null {
  const s = raw.trim().replace(/[‎‏]/g, "");
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.\-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})[/.\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{2})$/);
  if (m) return `20${m[2]}-${m[1].padStart(2, "0")}`;
  const he = HEBREW_MONTHS.findIndex((name) => s.startsWith(name));
  if (he >= 0) {
    const y = s.match(/(\d{4}|\d{2})\s*$/);
    const year = y ? (y[1].length === 2 ? 2000 + Number(y[1]) : Number(y[1])) : hintYear;
    return year ? `${year}-${String(he + 1).padStart(2, "0")}` : null;
  }
  const d = parseBankDate(s);
  if (d) return d.slice(0, 7);
  // מספר סידורי של אקסל (ימים מ־1899-12-30)
  if (/^\d{5}$/.test(s)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return date.toISOString().slice(0, 7);
  }
  if (/^\d{1,2}$/.test(s) && hintYear && Number(s) >= 1 && Number(s) <= 12) return `${hintYear}-${s.padStart(2, "0")}`;
  return null;
}

const num = (raw: string): number | null => {
  const s = raw.replace(/[%\s,₪]/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const money = (raw: string): Agorot | null => parseBankAmount(raw);
const text = (raw: string) => raw.trim();
const normalizeId = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 9 ? digits.padStart(9, "0") : raw.trim();
};

export interface PayslipImportResult {
  rows: PayslipRow[];
  issues: PayrollIssue[];
  skipped: number;
}

/** החלת המיפוי על הטבלה. שורות בלי ת.ז. / חודש / ברוטו מדולגות ונספרות */
export function applyPayslipMapping(table: PayslipTable, map: PayslipColumnMap, hintYear?: number): PayslipImportResult {
  const missing = missingRequiredFields(map);
  if (missing.length) {
    throw new PayslipParseError(`חסר מיפוי לעמודות חובה: ${missing.map((f) => PAYSLIP_FIELDS[f].label).join(", ")}`);
  }
  const get = (r: string[], f: PayslipField) => (map[f] === undefined ? "" : (r[map[f]!] ?? ""));
  const rows: PayslipRow[] = [];
  const issues: PayrollIssue[] = [];
  let skipped = 0;
  const badMonths: string[] = [];
  table.rows.forEach((r, i) => {
    const line = i + 1;
    const taxId = normalizeId(get(r, "taxId"));
    const month = parsePayslipMonth(get(r, "month"), hintYear);
    const gross = money(get(r, "gross"));
    const net = money(get(r, "net"));
    // שורות סיכום ("סה"כ") וריקות
    if (!taxId || /^0+$/.test(taxId) || /סה.?כ|סך/.test(get(r, "taxId") + get(r, "name"))) {
      skipped++;
      return;
    }
    if (!month) {
      badMonths.push(get(r, "month") || `שורה ${line}`);
      skipped++;
      return;
    }
    if (gross === null || net === null) {
      skipped++;
      return;
    }
    const first = get(r, "firstName");
    const last = get(r, "lastName");
    const name = (get(r, "name") || `${first} ${last}`).trim();
    rows.push({
      taxId,
      employeeNo: text(get(r, "employeeNo")) || null,
      name,
      month,
      startDate: parseBankDate(get(r, "startDate")),
      endDate: parseBankDate(get(r, "endDate")),
      jobPercent: num(get(r, "jobPercent")),
      hours: num(get(r, "hours")),
      overtimeHours: num(get(r, "overtimeHours")),
      hourlyRate: money(get(r, "hourlyRate")),
      baseSalary: money(get(r, "baseSalary")),
      overtimePay: money(get(r, "overtimePay")),
      gross,
      taxableGross: money(get(r, "taxableGross")),
      niWages: money(get(r, "niWages")),
      incomeTax: money(get(r, "incomeTax")),
      niEmployee: money(get(r, "niEmployee")),
      healthEmployee: money(get(r, "healthEmployee")),
      pensionEmployee: money(get(r, "pensionEmployee")),
      studyFundEmployee: money(get(r, "studyFundEmployee")),
      otherDeductions: money(get(r, "otherDeductions")),
      totalDeductions: money(get(r, "totalDeductions")),
      net,
      pensionEmployer: money(get(r, "pensionEmployer")),
      severanceEmployer: money(get(r, "severanceEmployer")),
      studyFundEmployer: money(get(r, "studyFundEmployer")),
      niEmployer: money(get(r, "niEmployer")),
      employerCost: money(get(r, "employerCost")),
      recuperationPay: money(get(r, "recuperationPay")),
      vacationBalance: num(get(r, "vacationBalance")),
      sickBalance: num(get(r, "sickBalance")),
      bankAccount: text(get(r, "bankAccount")).replace(/\s+/g, "") || null,
      department: text(get(r, "department")) || null,
      line,
    });
  });
  if (badMonths.length) {
    issues.push({ severity: "warning", message: `${badMonths.length} שורות עם חודש שכר שלא זוהה (למשל "${badMonths[0]}") דולגו` });
  }
  if (rows.length === 0) throw new PayslipParseError("לא נמצאו שורות תלוש תקינות אחרי המיפוי — בדקו את עמודות מספר הזהות, החודש, הברוטו והנטו");
  return { rows, issues, skipped };
}
