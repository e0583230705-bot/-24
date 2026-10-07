/**
 * בניית קובץ 126 לבדיקות, לפי עמודות המפרט לשנת 2025 (ראו `src/lib/domain/payroll/form126-fields.ts`).
 * הסכומים נרשמים בשקלים שלמים כמו בקובץ אמיתי. ברירת המחדל: מעסיק, 3 עובדים, 12 חודשים ורשומות סיכום שמתאימות
 * בדיוק לצבירה — וידיות (knobs) לשבירת כל אחת מבדיקות השלמות.
 */
import { FORM126_DATA_LENGTH } from "@/lib/domain/payroll/form126-fields";
import { encode1255, record } from "./uniform-fixture";

export const FILE_ID = 912345678;
export const TAX_YEAR = 2025;

type Field = [from: number, to: number, value: string | number, kind?: "n" | "x"];

/** רשומה באורך 964 תווים (CR LF נוספים בעת חיבור הקובץ); העמודות 1–17 משותפות לכל סוגי הרשומות */
function rec(type: "10" | "20" | "30" | "40" | "50", year: number, fields: Field[]) {
  return record(FORM126_DATA_LENGTH, [[1, 9, FILE_ID], [10, 11, 0], [12, 13, type, "x"], [14, 17, year], [18, 26, 0], ...fields]);
}

export interface FixtureEmployee {
  id: string;
  lastName: string;
  firstName: string;
  jobType: string;
  /** פירוט חודשי עבודה כפי שבשדה 24: "N" לשנה מלאה או צמדי חודשים */
  months: string;
  monthsWorked: number;
  /** שדה 26 — תשלומים מהם נוכה מס רגיל (שקלים) */
  regular: number;
  /** שדה 27 שווי רכב, נכלל גם ב־40ב' */
  car: number;
  tax: number;
  niEmployee: number;
  healthEmployee: number;
  pensionEmployee: number;
  pensionEmployer: number;
  severanceEmployer: number;
  studyFundEmployer: number;
  studyFundEmployee: number;
  year?: number;
}

export const EMPLOYEES: FixtureEmployee[] = [
  {
    id: "123456782", lastName: "כהן", firstName: "משה", jobType: "01", months: "N", monthsWorked: 12,
    regular: 108000, car: 12000, tax: 18000, niEmployee: 4200, healthEmployee: 5400,
    pensionEmployee: 7200, pensionEmployer: 7800, severanceEmployer: 10000, studyFundEmployer: 9000, studyFundEmployee: 3000,
  },
  {
    id: "200000008", lastName: "לוי", firstName: "שרה", jobType: "01", months: "040509101112", monthsWorked: 6,
    regular: 60000, car: 0, tax: 6000, niEmployee: 2100, healthEmployee: 2700,
    pensionEmployee: 3600, pensionEmployer: 3900, severanceEmployer: 5000, studyFundEmployer: 0, studyFundEmployee: 0,
  },
  {
    id: "000000018", lastName: "מזרחי", firstName: "יעקב", jobType: "02", months: "N", monthsWorked: 12,
    regular: 30000, car: 0, tax: 15000, niEmployee: 1000, healthEmployee: 1500,
    pensionEmployee: 0, pensionEmployer: 0, severanceEmployer: 0, studyFundEmployer: 0, studyFundEmployee: 0,
  },
];

export const gross = (e: FixtureEmployee) => e.regular + e.car;

export function employerRecord(declaredEmployees = EMPLOYEES.length) {
  return rec("10", TAX_YEAR, [
    [27, 28, 1], [29, 33, declaredEmployees], [34, 34, 0], [35, 52, "מפעלי הדוגמה בע\"מ"], [96, 104, 36000000],
    [105, 105, " ", "x"], [106, 106, 1], [107, 125, "הרצל"], [126, 130, "12"], [131, 150, "תל אביב"], [151, 155, 61000],
  ]);
}

export function employeeRecord(e: FixtureEmployee) {
  return rec("20", e.year ?? TAX_YEAR, [
    [18, 26, e.id, "x"], [43, 43, 0], [44, 63, e.lastName], [64, 78, e.firstName], [79, 98, "הרב קוק 3"], [99, 113, "ירושלים"],
    [114, 118, 91000], [119, 119, 1], [120, 121, 20], [132, 139, 19800515], [172, 173, e.jobType, "x"], [174, 181, 20200101],
    [182, 203, e.months], [204, 205, e.monthsWorked],
    [206, 215, e.regular], [216, 223, e.car], [306, 315, gross(e)], [332, 340, e.car],
    [491, 494, 225], [495, 500, 6534],
    [558, 563, e.pensionEmployer], [571, 576, e.pensionEmployee], [585, 590, e.studyFundEmployer], [592, 597, e.studyFundEmployee],
    [624, 629, e.severanceEmployer],
    [728, 736, e.tax], [822, 829, e.niEmployee], [830, 837, e.healthEmployee], [838, 845, gross(e)], [864, 864, 1],
  ]);
}

/** החודשים (1–12) שבהם העובד עבד, לפי שדה 24 */
export function workedIn(e: FixtureEmployee, month: number) {
  if (e.months.trim() === "N") return true;
  for (let i = 0; i < e.months.length; i += 2) if (Number(e.months.slice(i, i + 2)) === month) return true;
  return false;
}

/** נתוני חודש אחד כפי שהיו מדווחים בטופס 102: שכר לפי חודשי העבודה, מס יחסי, ביטוח לאומי 20% מהשכר */
export function monthData(employees: FixtureEmployee[], month: number) {
  const active = employees.filter((e) => workedIn(e, month));
  const wages = active.reduce((s, e) => s + gross(e) / e.monthsWorked, 0);
  const tax = active.reduce((s, e) => s + e.tax / e.monthsWorked, 0);
  return { count: active.length, wages, tax, ni: wages * 0.2 };
}

export function monthRecord(employees: FixtureEmployee[], month: number, year = TAX_YEAR) {
  const m = monthData(employees, month);
  return rec("50", year, [
    [27, 28, month], [29, 34, m.count], [35, 46, m.wages], [47, 58, m.tax], [59, 70, 0], [71, 82, m.tax], [83, 94, 0],
    [95, 106, m.tax], [107, 118, m.ni], [119, 130, m.wages], [131, 142, 0], [143, 154, 0],
  ]);
}

const sum = (employees: FixtureEmployee[], f: (e: FixtureEmployee) => number) => employees.reduce((s, e) => s + f(e), 0);

export function summaryRecord(employees: FixtureEmployee[], totalRecords: number, { declaredCount }: { declaredCount?: number } = {}) {
  return rec("30", TAX_YEAR, [
    [32, 43, sum(employees, (e) => e.regular)], [44, 55, 0], [56, 67, 0], [68, 79, 0], [80, 91, 0],
    [92, 103, sum(employees, gross)], [104, 115, sum(employees, (e) => e.tax)], [116, 121, declaredCount ?? employees.length],
    [126, 137, sum(employees, gross)], [138, 149, 0], [150, 161, 0], [162, 173, 0], [174, 185, 0],
    [186, 197, sum(employees, (e) => e.niEmployee)], [198, 209, sum(employees, (e) => e.healthEmployee)],
    [210, 211, "44"], [212, 216, "בדיקה"], [284, 289, totalRecords],
  ]);
}

export function partARecord(employees: FixtureEmployee[], { break40Totals = false, months = 12 }: { break40Totals?: boolean; months?: number } = {}) {
  const monthly = Array.from({ length: months }, (_, i) => monthData(employees, i + 1));
  const wages102 = monthly.reduce((s, m) => s + m.wages, 0);
  const tax102 = monthly.reduce((s, m) => s + m.tax, 0);
  const ni102 = monthly.reduce((s, m) => s + m.ni, 0);
  const grossAll = sum(employees, gross);
  const taxAll = sum(employees, (e) => e.tax);
  const niEmployee = sum(employees, (e) => e.niEmployee + e.healthEmployee);
  return rec("40", TAX_YEAR, [
    [33, 33, 2], [34, 42, 515555555], [43, 43, 1],
    [44, 54, wages102], [55, 65, ni102], [77, 87, 0], [88, 98, 0], [110, 120, grossAll + (break40Totals ? 1000 : 0)],
    [132, 142, wages102], [143, 153, 0], [154, 164, 0], [165, 175, tax102], [176, 181, 0], [182, 192, taxAll],
    [193, 203, 0], [204, 214, 0], [215, 225, sum(employees, (e) => e.car)], [226, 233, 0], [234, 283, "AUDIT@EXAMPLE.CO.IL"],
    [284, 289, employees.length], [290, 299, taxAll], [300, 311, grossAll], [312, 321, grossAll - wages102], [322, 331, grossAll - wages102],
    [332, 341, 0], [342, 351, 0], [352, 361, ni102], [362, 371, niEmployee], [372, 381, taxAll], [382, 393, 0], [394, 401, 0],
    [889, 899, 0], [900, 910, 0], [911, 921, 0], [922, 932, 0],
  ]);
}

export interface Form126FixtureOptions {
  /** מספר רשומות הפרט שרשומה 30 תצהיר עליו (ברירת מחדל: הנכון) */
  declaredCount?: number;
  /** שיבוש סה"כ המשכורת ברשומה 40 (שדה 17) ב־1,000 ₪ */
  break40Totals?: boolean;
  /** העובד השלישי מקבל את מספר הזהות וסוג המשרה של הראשון */
  duplicateId?: boolean;
  /** השמטת חודש דצמבר מרשומות 50 */
  dropMonth?: number;
  /** מספר זהות עם ספרת ביקורת שגויה לעובדת השנייה */
  invalidId?: boolean;
  /** שנת מס שונה ברשומות 50 */
  wrongYearInMonths?: boolean;
  /** רשומה בסוג לא מוכר */
  unknownRecord?: boolean;
  /** רשומת פרט קצרה מהנדרש */
  shortRecord?: boolean;
  /** סכום חודשי ששונה כך שצבירת 50 לא תתאים ל־40 */
  breakMonthTotals?: boolean;
  employees?: FixtureEmployee[];
}

/** בניית קובץ 126 שלם כטקסט (לפני קידוד) */
export function buildForm126Text(opts: Form126FixtureOptions = {}) {
  let employees = opts.employees ?? EMPLOYEES;
  if (opts.duplicateId) employees = employees.map((e, i) => (i === 2 ? { ...e, id: employees[0].id, jobType: employees[0].jobType } : e));
  if (opts.invalidId) employees = employees.map((e, i) => (i === 1 ? { ...e, id: "200000001" } : e));

  const monthNos = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => m !== opts.dropMonth);
  const recs: string[] = [employerRecord()];
  employees.forEach((e, i) => {
    let r = employeeRecord(e);
    if (opts.shortRecord && i === 0) r = r.slice(0, 900);
    recs.push(r);
  });
  recs.push(summaryRecord(employees, 1 + employees.length + monthNos.length + 2, { declaredCount: opts.declaredCount }));
  recs.push(partARecord(employees, { break40Totals: opts.break40Totals }));
  for (const m of monthNos) {
    let r = monthRecord(employees, m, opts.wrongYearInMonths ? TAX_YEAR - 1 : TAX_YEAR);
    if (opts.breakMonthTotals && m === 1) r = monthRecord([...employees, { ...employees[2], months: "01", monthsWorked: 1 }], m);
    recs.push(r);
  }
  if (opts.unknownRecord) recs.push(rec("10", TAX_YEAR, []).slice(0, 11) + "77" + " ".repeat(FORM126_DATA_LENGTH - 13));
  return recs.join("\r\n") + "\r\n";
}

/** קובץ 126 מקודד Windows-1255, כפי שמייצאות תוכנות השכר */
export function buildForm126(opts: Form126FixtureOptions = {}): Uint8Array {
  return encode1255(buildForm126Text(opts));
}
