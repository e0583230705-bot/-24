import type { Agorot } from "../money";
import { isValidIsraeliId } from "../israeli-id";
import { decodeUniform, parseUniformDate } from "../ledger/uniform-format";
import {
  FORM126_DATA_LENGTH,
  FORM126_RECORDS,
  PRIOR_YEAR_JOB_TYPES,
  SEVERANCE_JOB_TYPES,
  RECORD_20,
  RECORD_30,
  RECORD_40,
  RECORD_50,
  type Form126Field,
} from "./form126-fields";
import type { PayrollDeclaredTotals, PayrollEmployeeYear, PayrollEmployer, PayrollFile, PayrollIssue, PayrollMonth } from "./types";

/**
 * קליטת קובץ 126 (דוח שנתי על ניכויים משכר) לפי מפרט רשות המסים לשנת המס 2025.
 * מיקומי השדות ב־`form126-fields.ts`. הסכומים בקובץ בשקלים שלמים ומומרים כאן לאגורות.
 *
 * מעבר לקריאת הנתונים, הקולט מבצע את בדיקות השלמות שהמפרט עצמו מתאר (עמ' 1): התאמה בין צבירת רשומות הפרט (20)
 * לרשומות הסיכום (30, 40), ובין צבירת הרשומות החודשיות (50 = טופס 102) לרשומה 40. אי־התאמה היא ממצא ביקורת.
 */

export class Form126Error extends Error {}

const field = (line: string, f: Form126Field) => line.slice(f.from - 1, f.to);
const byNo = (table: Form126Field[]) => new Map(table.map((f) => [f.no, f]));
const F20 = byNo(RECORD_20);
const F30 = byNo(RECORD_30);
const F40 = byNo(RECORD_40);
const F50 = byNo(RECORD_50);

/** שדה לפי מספרו במפרט, מנוקה מרווחים */
function get(line: string, table: Map<string, Form126Field>, no: string): string {
  const f = table.get(no);
  if (!f) throw new Error(`שדה ${no} אינו מוגדר בטבלה`);
  return field(line, f).trim();
}

/**
 * מספר שלם לפי כללי הדיווח: אפסים מובילים, מינוס בתו השמאלי ביותר, רווחים = ריק (0).
 * מחזיר null לתוכן שאינו מספר (אות במקום ספרה וכו').
 */
export function parseForm126Number(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return 0;
  const m = s.match(/^(-?)(\d+)$/);
  if (!m) return null;
  return m[1] === "-" ? -Number(m[2]) : Number(m[2]);
}

/** סכום בשקלים שלמים → אגורות */
const toAgorotFromShekels = (n: number): Agorot => n * 100;

interface Counter {
  bad: number;
}

/** קורא שדה סכום ומחזיר אגורות; תוכן לא תקין נספר ומוחזר כ־0 */
function amount(line: string, table: Map<string, Form126Field>, no: string, counter: Counter): Agorot {
  const n = parseForm126Number(get(line, table, no));
  if (n === null) {
    counter.bad++;
    return 0;
  }
  return toAgorotFromShekels(n);
}

function int(line: string, table: Map<string, Form126Field>, no: string, counter: Counter): number {
  const n = parseForm126Number(get(line, table, no));
  if (n === null) {
    counter.bad++;
    return 0;
  }
  return n;
}

/** כל השדות שאינם FILLER, לפי מספר השדה — לשקיפות בעת בדיקה */
function rawFields(line: string, table: Form126Field[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of table) {
    if (f.name === "FILLER") continue;
    const v = field(line, f).trim();
    if (v !== "" && !/^0+$/.test(v)) out[f.no] = v;
  }
  return out;
}

const splitLines = (text: string) => text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");

/**
 * זיהוי מהיר: הרשומה הראשונה היא רשומה מובילה ("10" בעמודות 12–13) באורך 966 בתים כולל CR LF
 * (או 964 תווי נתונים כשהקובץ מופרד ב־LF בלבד).
 */
export function isForm126(bytes: Uint8Array): boolean {
  if (bytes.length < FORM126_DATA_LENGTH) return false;
  const type = String.fromCharCode(bytes[11], bytes[12]);
  if (type !== "10") return false;
  const first = Array.from(bytes.subarray(0, FORM126_DATA_LENGTH + 2));
  const lineEnd = first.findIndex((b) => b === 0x0a || b === 0x0d);
  const dataLen = lineEnd === -1 ? bytes.length : lineEnd;
  return dataLen === FORM126_DATA_LENGTH;
}

/** שם שדה ברשומה 40 → מפתח קריא ב־declared.sums (קידומת r40_) */
const SUMS_40: Record<string, string> = {
  "11": "r40_wages_102_col_z",
  "12": "r40_ni_102",
  "14": "r40_ni_exempt_payments",
  "15": "r40_ni_exempt_above_max",
  "17": "r40_gross_wages",
  "19": "r40_wages_102_col_d",
  "20": "r40_employment_service_wages",
  "21": "r40_employers_tax_102",
  "22": "r40_tax_withheld_102",
  "23": "r40_eilat_benefit",
  "24": "r40_tax_withheld",
  "25": "r40_injury_pay",
  "26": "r40_reserve_duty_pay",
  "27": "r40_benefits_in_kind",
  "28": "r40_foreign_workers_levy",
  "30א": "r40_tax_after_offset",
  "30ב": "r40_gross_wages_plus_employment_service",
  "30ג": "r40_diff_gross_vs_102_col_d",
  "30ד": "r40_diff_gross_vs_102_col_z",
  "30ה": "r40_employers_tax_employment_service",
  "30ו": "r40_payroll_tax_employment_service",
  "30ז": "r40_ni_102_col_v",
  "30ח": "r40_ni_employee_withheld",
  "30ט": "r40_tax_and_employers_tax",
  "30י": "r40_payroll_tax",
  "30י1": "r40_eilat_benefit_offset",
  "30יא3": "r40_convalescence_total",
  "30יא4": "r40_convalescence_employer_share",
  "30יא5": "r40_convalescence_wages_102",
  "30יא6": "r40_convalescence_charges_102",
};

/** שם שדה ברשומה 30 → מפתח ב־declared.sums (קידומת r30_) */
const SUMS_30: Record<string, string> = {
  "7": "r30_regular_taxable_payments",
  "8": "r30_shift_wages_reduced_tax",
  "9": "r30_taxed_contributions",
  "10": "r30_employers_tax_exempt_payments",
  "11": "r30_tax_exempt_payments",
  "12": "r30_gross_wages",
  "13": "r30_tax_withheld",
  "15": "r30_ni_wages",
  "16": "r30_ni_exempt_payments",
  "17": "r30_ni_exempt_above_max",
  "18": "r30_prior_years_gross",
  "19": "r30_additional_wages",
  "20": "r30_ni_employee",
  "21": "r30_health_employee",
};

/**
 * בדיקות התאמה בין צבירת רשומות 20 לרשומות הסיכום: [תיאור, שדות ברשומה 20 שמסוכמים, מפתח ב־sums]
 * לפי "צבירת שדה N" שבמפרט.
 */
const CHECKS_20_VS_30: [string, string[], string][] = [
  ["תשלומים מהם נוכה מס רגיל (שדה 26)", ["26"], "r30_regular_taxable_payments"],
  ["שכר משמרות ממנו נוכה מס מופחת (שדה 36)", ["36"], "r30_shift_wages_reduced_tax"],
  ["הפרשות ממנו נוכה מס (שדות 30+32+33)", ["30", "32", "33"], "r30_taxed_contributions"],
  ["סה\"כ משכורת ותשלומים (שדה 39)", ["39"], "r30_gross_wages"],
  ["מס הכנסה שנוכה (שדה 116)", ["116"], "r30_tax_withheld"],
  ["שכר חייב בדמי ביטוח לאומי (שדה 126)", ["126"], "r30_ni_wages"],
  ["תשלומים פטורים מדמי ביטוח לאומי (שדה 123)", ["123"], "r30_ni_exempt_payments"],
  ["תשלומים מעל תקרת ביטוח לאומי (שדה 127)", ["127"], "r30_ni_exempt_above_max"],
  ["ברוטו הפרשים שנים קודמות (שדה 133ב')", ["133ב"], "r30_prior_years_gross"],
  ["שכר נוסף (שדה 134)", ["134"], "r30_additional_wages"],
  ["דמי ביטוח לאומי שנוכו מהעובדים (שדה 124)", ["124"], "r30_ni_employee"],
  ["דמי ביטוח בריאות שנוכו מהעובדים (שדה 125)", ["125"], "r30_health_employee"],
];
const CHECKS_20_VS_40: [string, string[], string][] = [
  ["תשלומים פטורים מדמי ביטוח לאומי (שדה 123)", ["123"], "r40_ni_exempt_payments"],
  ["תשלומים מעל תקרת ביטוח לאומי (שדה 127)", ["127"], "r40_ni_exempt_above_max"],
  ["סה\"כ משכורת ותשלומים (שדה 39)", ["39"], "r40_gross_wages"],
  ["מס הכנסה שנוכה (שדה 116)", ["116"], "r40_tax_withheld"],
  ["דמי ביטוח לאומי ובריאות שנוכו מהעובדים (שדות 124+125)", ["124", "125"], "r40_ni_employee_withheld"],
  ["מחיר יום הבראה (שדה 50)", ["50"], "r40_convalescence_total"],
  ["חלק המעסיק במחיר יום הבראה (שדה 51ב')", ["51ב"], "r40_convalescence_employer_share"],
];
/** צבירת רשומות 50 (חודשים 1–12) מול רשומה 40: [תיאור, שדה ברשומה 50, מפתח ב־sums] */
const CHECKS_50_VS_40: [string, string, string][] = [
  ["משכורת ותשלומים לפי טופס 102, טור ז' (שדה 15 ברשומה 50)", "15", "r40_wages_102_col_z"],
  ["משכורת ותשלומים לפי טופס 102, טור ד' (שדה 8 ברשומה 50)", "8", "r40_wages_102_col_d"],
  ["דמי ביטוח לאומי ובריאות לפי טופס 102 (שדה 14 ברשומה 50)", "14", "r40_ni_102"],
  ["דמי ביטוח לאומי ובריאות לפי טופס 102, טור ו' (שדה 14 ברשומה 50)", "14", "r40_ni_102_col_v"],
  ["ניכוי מס הכנסה לפי טופס 102 (שדה 13 ברשומה 50)", "13", "r40_tax_withheld_102"],
  ["ניכוי המס לפני קיזוז הטבת אילת (שדה 9 ברשומה 50)", "9", "r40_tax_withheld"],
  ["מס מעסיקים והיטל עובדים זרים (שדה 10 ברשומה 50)", "10", "r40_employers_tax_102"],
  ["שכר שדווח באמצעות שירות התעסוקה (שדה 20 ברשומה 50)", "20", "r40_employment_service_wages"],
  ["מס שכר (שדה 16 ברשומה 50)", "16", "r40_payroll_tax"],
];

const shekels = (agorot: Agorot) => (agorot / 100).toLocaleString("he-IL");

function parseEmployee(line: string, counter: Counter): PayrollEmployeeYear {
  const taxId = get(line, F20, "5").padStart(9, "0");
  const jobType = get(line, F20, "22").padStart(2, "0");
  const a = (no: string) => amount(line, F20, no, counter);
  const creditPointsRaw = get(line, F20, "77");
  const creditPoints = creditPointsRaw === "" ? null : parseForm126Number(creditPointsRaw);
  return {
    taxId,
    // אפסים = עובד זר בלי מספר מזהה (עמ' 6, סעיף ו'); אפסים עוברים את בדיקת ספרת הביקורת, ולכן נבדקים בנפרד
    idKind: /^0+$/.test(taxId) || !isValidIsraeliId(taxId) ? "other" : "israeli",
    lastName: get(line, F20, "9"),
    firstName: get(line, F20, "10"),
    birthDate: parseUniformDate(get(line, F20, "18")),
    startDate: parseUniformDate(get(line, F20, "23")),
    // במפרט אין שדה תאריך סיום עבודה; פירוט חודשי העבודה (שדה 24) נשמר ב־raw
    endDate: null,
    monthsWorked: int(line, F20, "25", counter),
    jobType,
    grossWages: a("39"),
    // 40ב' "סה"כ קצובות שהעובד חויב בהן" — חדש ב־2025; שווי רכב לבדו בשדה 27 (ב־raw)
    benefitsInKind: a("40ב"),
    exemptIncome: a("40"),
    niWages: a("126"),
    taxWithheld: a("116"),
    niEmployee: a("124") + a("125"),
    pensionEmployee: a("89"),
    pensionEmployer: a("86"),
    // 99א' מרכיב הפיצויים השוטף + 99ב' השלמת התחייבות לפיצויים
    severanceEmployer: a("99א") + a("99ב"),
    studyFundEmployee: a("93"),
    studyFundEmployer: a("91"),
    // ברשומת פיצויי פרישה החלק החייב בשדה 26 והחלק הפטור בשדה 38 (עמ' 33)
    severancePaid: SEVERANCE_JOB_TYPES.has(jobType) ? a("26") + a("38") : 0,
    creditPoints,
    raw: rawFields(line, RECORD_20),
  };
}

function parseMonth(line: string, taxYear: number, counter: Counter): PayrollMonth {
  const monthNo = int(line, F50, "6", counter);
  const a = (no: string) => amount(line, F50, no, counter);
  return {
    month: `${taxYear}-${String(monthNo).padStart(2, "0")}`,
    employeeCount: int(line, F50, "7", counter),
    wagesTaxable: a("8"),
    // שדה 9 הוא הניכוי לפני קיזוז הטבת אילת; יתרת המס אחרי קיזוז בשדה 13 (ב־raw)
    taxWithheld: a("9"),
    // טופס 102 מס הכנסה אינו כולל שכר חייב בביטוח לאומי, ולכן אין לו מקור ברשומה 50
    wagesNi: 0,
    niTotal: a("14"),
    payrollTax: a("16"),
    // ברשומה 50 מס מעסיקים והיטל עובדים זרים מדווחים יחד בשדה 10 (מס מעסיקים בוטל לרוב המעסיקים)
    foreignWorkersLevy: a("10"),
    raw: rawFields(line, RECORD_50),
  };
}

/** סכום שדה (באגורות) על פני רשומות 20 */
function sum20(lines: string[], nos: string[]): Agorot {
  let total = 0;
  const c: Counter = { bad: 0 };
  for (const l of lines) for (const no of nos) total += amount(l, F20, no, c);
  return total;
}

export function parseForm126(bytes: Uint8Array): PayrollFile {
  const text = decodeUniform(bytes);
  const all = splitLines(text);
  const first = all[0];
  if (!first || first.slice(11, 13) !== "10") {
    throw new Form126Error("הקובץ אינו קובץ 126: הרשומה הראשונה אינה רשומה מובילה מסוג 10");
  }

  const issues: PayrollIssue[] = [];
  const counter: Counter = { bad: 0 };
  const header = first.padEnd(FORM126_DATA_LENGTH, " ");
  const F10 = byNo(FORM126_RECORDS["10"]);
  const taxYear = int(header, F10, "4", counter);
  const employer: PayrollEmployer = {
    deductionsFileId: get(header, F10, "1"),
    name: get(header, F10, "9"),
    taxYear,
    corporationNo: get(header, F10, "2") || "00",
    declaredEmployees: get(header, F10, "7") === "" ? null : int(header, F10, "7", counter),
    raw: rawFields(header, FORM126_RECORDS["10"]),
  };

  const employees: PayrollEmployeeYear[] = [];
  const employeeLines: string[] = [];
  const months: PayrollMonth[] = [];
  const declared: PayrollDeclaredTotals = { employeeRecords: null, sums: {}, raw: {} };
  const monthSums: Record<string, Agorot> = {};
  const seenMonths = new Map<number, number>();
  const unknownTypes = new Set<string>();
  const yearMismatch: string[] = [];
  let wrongLength = 0;
  let count30 = 0;
  let count40 = 0;
  let declaredTotalRecords: number | null = null;

  all.forEach((rawLine, i) => {
    if (rawLine.length !== FORM126_DATA_LENGTH) wrongLength++;
    const l = rawLine.padEnd(FORM126_DATA_LENGTH, " ");
    const type = l.slice(11, 13);
    if (i === 0) return;
    if (!(type in FORM126_RECORDS)) {
      unknownTypes.add(type);
      return;
    }
    const table = FORM126_RECORDS[type as keyof typeof FORM126_RECORDS];
    const recYear = parseForm126Number(l.slice(13, 17));
    const jobType = type === "20" ? l.slice(171, 173).trim().padStart(2, "0") : "";
    if (recYear !== taxYear && !(type === "20" && PRIOR_YEAR_JOB_TYPES.has(jobType))) {
      yearMismatch.push(`רשומה ${i + 1} (סוג ${type}): ${l.slice(13, 17).trim() || "ריק"}`);
    }

    if (type === "20") {
      employeeLines.push(l);
      employees.push(parseEmployee(l, counter));
    } else if (type === "50") {
      const monthNo = int(l, F50, "6", counter);
      if (monthNo >= 1 && monthNo <= 12) {
        seenMonths.set(monthNo, (seenMonths.get(monthNo) ?? 0) + 1);
        months.push(parseMonth(l, taxYear, counter));
        for (const no of new Set(CHECKS_50_VS_40.map(([, n]) => n))) monthSums[no] = (monthSums[no] ?? 0) + amount(l, F50, no, counter);
      } else {
        // רשומות 13–16: תשלומים נוספים לצורכי מידע; כבר כלולים בחודשים 1–12 ולכן לא נצברים
        for (const [k, v] of Object.entries(rawFields(l, table))) declared.raw[`50/${monthNo}/${k}`] = v;
      }
    } else if (type === "30") {
      count30++;
      declared.employeeRecords = int(l, F30, "14", counter);
      declaredTotalRecords = int(l, F30, "24א", counter);
      for (const [no, key] of Object.entries(SUMS_30)) declared.sums[key] = amount(l, F30, no, counter);
      for (const [k, v] of Object.entries(rawFields(l, table))) declared.raw[`30/${k}`] = v;
      if (get(l, F30, "22") !== "44" || get(l, F30, "23") !== "בדיקה") {
        issues.push({ severity: "warning", message: "ברשומת הסיכום 30 חסרים הקבועים \"44\" ו\"בדיקה\" שהמפרט דורש" });
      }
    } else if (type === "40") {
      count40++;
      for (const [no, key] of Object.entries(SUMS_40)) declared.sums[key] = amount(l, F40, no, counter);
      for (const [k, v] of Object.entries(rawFields(l, table))) declared.raw[`40/${k}`] = v;
    } else if (type === "10") {
      issues.push({ severity: "warning", message: `רשומה ${i + 1} היא רשומה מובילה נוספת (סוג 10) — ייתכן שכמה קבצים אוחדו` });
    }
  });

  if (wrongLength > 0) {
    issues.push({
      severity: "error",
      message: `${wrongLength} רשומות אינן באורך ${FORM126_DATA_LENGTH} תווים (966 בתים כולל CR LF) כנדרש במפרט — ייתכן שהעמודות זזו`,
    });
  }
  if (unknownTypes.size > 0) {
    issues.push({ severity: "error", message: `סוגי רשומה לא מוכרים בקובץ: ${[...unknownTypes].map((t) => `"${t}"`).join(", ")}` });
  }
  if (counter.bad > 0) {
    issues.push({ severity: "error", message: `${counter.bad} שדות נומריים עם תוכן שאינו מספר — נקלטו כ־0` });
  }
  if (yearMismatch.length > 0) {
    issues.push({
      severity: "error",
      message: `שנת המס ברשומה המובילה היא ${taxYear}, אבל ב־${yearMismatch.length} רשומות מופיעה שנה אחרת (למשל ${yearMismatch.slice(0, 3).join("; ")})`,
    });
  }
  if (employees.length === 0) issues.push({ severity: "error", message: "בקובץ אין רשומות פרט (20) — אין עובדים" });

  // רשומות סיכום
  if (count30 === 0) issues.push({ severity: "error", message: "חסרה רשומת סיכום 30" });
  if (count40 === 0) issues.push({ severity: "error", message: "חסרה רשומת סיכום והפרשים 40 (חלק א')" });
  if (declared.employeeRecords !== null && declared.employeeRecords !== employees.length) {
    issues.push({
      severity: "error",
      message: `רשומת הסיכום 30 מצהירה על ${declared.employeeRecords} רשומות פרט, ובקובץ יש ${employees.length}`,
    });
  }
  if (declaredTotalRecords !== null && declaredTotalRecords !== 0 && declaredTotalRecords !== all.length) {
    issues.push({
      severity: "warning",
      message: `רשומת הסיכום 30 מצהירה על ${declaredTotalRecords} רשומות בסך הכול, ובקובץ יש ${all.length}`,
    });
  }
  if (employer.declaredEmployees !== null && employer.declaredEmployees !== 0 && employer.declaredEmployees !== employees.length) {
    issues.push({
      severity: "warning",
      message: `הרשומה המובילה מצהירה על ${employer.declaredEmployees} עובדים, ובקובץ ${employees.length} רשומות פרט`,
    });
  }

  // צבירת רשומות 20 מול הסיכומים
  const reconcile = (checks: [string, string[], string][], label: string) => {
    for (const [desc, nos, key] of checks) {
      if (!(key in declared.sums)) continue;
      const actual = sum20(employeeLines, nos);
      const declaredSum = declared.sums[key];
      if (actual !== declaredSum) {
        issues.push({
          severity: "error",
          message: `${label}: ${desc} — צבירת רשומות הפרט ${shekels(actual)} ₪ לעומת ${shekels(declaredSum)} ₪ שהוצהרו (הפרש ${shekels(actual - declaredSum)} ₪)`,
        });
      }
    }
  };
  if (count30 > 0) reconcile(CHECKS_20_VS_30, "רשומה 30");
  if (count40 > 0) reconcile(CHECKS_20_VS_40, "רשומה 40");

  // חודשים: חובה 12 רשומות (ינואר–דצמבר), אחת לכל חודש
  const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !seenMonths.has(m));
  if (missing.length > 0) {
    issues.push({
      severity: "error",
      message: `חסרות רשומות חודשיות (50) לחודשים ${missing.map((m) => String(m).padStart(2, "0")).join(", ")} — המפרט דורש 12 חודשים`,
    });
  }
  const duplicateMonths = [...seenMonths.entries()].filter(([, n]) => n > 1).map(([m]) => String(m).padStart(2, "0"));
  if (duplicateMonths.length > 0) {
    issues.push({ severity: "error", message: `רשומה חודשית (50) כפולה לחודשים ${duplicateMonths.join(", ")}` });
  }

  // הבקרה 126 ↔ 102: צבירת החודשים מול רשומה 40 (עמ' 1 במפרט)
  if (count40 > 0 && months.length > 0) {
    for (const [desc, no, key] of CHECKS_50_VS_40) {
      if (!(key in declared.sums)) continue;
      const actual = monthSums[no] ?? 0;
      if (actual !== declared.sums[key]) {
        issues.push({
          severity: "error",
          message: `126 מול 102: ${desc} — צבירת החודשים ${shekels(actual)} ₪ לעומת ${shekels(declared.sums[key])} ₪ ברשומה 40 (הפרש ${shekels(actual - declared.sums[key])} ₪)`,
        });
      }
    }
  }

  // סוג משרה 01 או 02 יופיע למספר זהות פעם אחת בלבד (עמ' 1, סעיף 2)
  const seenMain = new Map<string, number>();
  for (const e of employees) {
    if (e.jobType !== "01" && e.jobType !== "02") continue;
    const k = `${e.taxId}/${e.jobType}`;
    seenMain.set(k, (seenMain.get(k) ?? 0) + 1);
  }
  const dupIds = [...seenMain.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupIds.length > 0) {
    issues.push({
      severity: "error",
      message: `${dupIds.length} מספרי זהות מופיעים יותר מפעם אחת באותו סוג משרה (01/02): ${dupIds.slice(0, 5).map((k) => k.replace("/", " סוג משרה ")).join("; ")}`,
    });
  }

  // מספר זהות: ספרת ביקורת לפי מודולוס 10 (עמ' 6). אפסים = עובד זר, ותושב חוץ עם מספר ישות (66) או מספר ב"ל (75/77)
  const invalidIds = employees.filter((e) => e.idKind === "other" && !/^0+$/.test(e.taxId) && !/^(66|75|77)/.test(e.taxId) && e.raw["8"] !== "1");
  if (invalidIds.length > 0) {
    issues.push({
      severity: "error",
      message: `${invalidIds.length} עובדים עם מספר זהות שאינו עובר בדיקת ספרת ביקורת: ${invalidIds.slice(0, 5).map((e) => e.taxId).join(", ")}`,
    });
  }

  return { employer, employees, months, declared, issues };
}
