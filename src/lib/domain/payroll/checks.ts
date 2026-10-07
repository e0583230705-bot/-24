import type { Agorot } from "../money";
import { isValidIsraeliId } from "../israeli-id";
import type { PayrollEmployeeYear, PayrollFile, PayrollMonth } from "./types";

/**
 * בדיקות על נתוני השכר עצמם (בלי ספרים ובלי קבצים נוספים): שלמות, עקביות, וסימני הונאה.
 * כל ממצא מקבל מפתח יציב (key) כדי שאפשר יהיה לתעד עליו הסבר בניירות העבודה.
 */

export type PayrollFindingKind =
  | "invalid_id"
  | "duplicate_id"
  | "no_deductions"
  | "months_out_of_range"
  | "wages_without_months"
  | "dates_inconsistent"
  | "left_before_year"
  | "ni_wages_exceed_gross"
  | "tax_exceeds_wages"
  | "high_wage_outlier"
  | "single_month"
  | "pension_missing"
  | "months_vs_employees"
  | "month_count"
  | "month_spike"
  | "employee_count_jump";

export interface PayrollFinding {
  key: string;
  kind: PayrollFindingKind;
  severity: "error" | "warning" | "info";
  /** ת.ז. או חודש שהממצא נוגע אליו, לתצוגה */
  subject: string;
  message: string;
  amount?: Agorot;
}

export const FINDING_LABELS: Record<PayrollFindingKind, string> = {
  invalid_id: "מספר זהות לא תקין",
  duplicate_id: "מספר זהות כפול",
  no_deductions: "שכר ללא ניכויים",
  months_out_of_range: "מספר חודשי עבודה לא סביר",
  wages_without_months: "שכר ללא חודשי עבודה",
  dates_inconsistent: "תאריכי העסקה לא עקביים",
  left_before_year: "שכר לעובד שסיים לפני השנה",
  ni_wages_exceed_gross: "שכר לביטוח לאומי גבוה מהברוטו",
  tax_exceeds_wages: "מס שנוכה גבוה מהשכר",
  high_wage_outlier: "שכר חריג",
  single_month: "עובד עם חודש עבודה אחד",
  pension_missing: "עובד ותיק ללא הפרשה לפנסיה",
  months_vs_employees: "סיכום החודשים שונה מסיכום העובדים",
  month_count: "מספר חודשים לא תקין",
  month_spike: "חודש חריג בעלות השכר",
  employee_count_jump: "שינוי חד במספר העובדים",
};

const money = (a: Agorot) => (a / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪";
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

export function checkEmployees(employees: PayrollEmployeeYear[], taxYear: number): PayrollFinding[] {
  const out: PayrollFinding[] = [];
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;
  const name = (e: PayrollEmployeeYear) => `${e.firstName} ${e.lastName}`.trim() || e.taxId;

  // ת.ז. כפולה באותו סוג משרה: לפי המפרט, סוג משרה 01/02 מופיע פעם אחת לכל ת.ז.
  const seen = new Map<string, number>();
  for (const e of employees) {
    const k = `${e.taxId}:${e.jobType}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) {
    if (n > 1 && !k.endsWith(":05")) {
      const [taxId, jobType] = k.split(":");
      out.push({
        key: `payroll:dup:${taxId}:${jobType}`,
        kind: "duplicate_id",
        severity: "error",
        subject: taxId,
        message: `מספר זהות ${taxId} מופיע ${n} פעמים בסוג משרה ${jobType} — ייתכן כפל תשלום או שתי רשומות לאותו עובד`,
      });
    }
  }

  const wages = employees.map((e) => e.grossWages).filter((w) => w > 0).sort((a, b) => a - b);
  const p95 = wages.length >= 10 ? wages[Math.floor(wages.length * 0.95)] : null;
  const median = wages.length ? wages[Math.floor(wages.length / 2)] : 0;

  for (const e of employees) {
    const id = e.taxId;
    const who = `${name(e)} (${id})`;
    if (e.idKind === "israeli" && !isValidIsraeliId(id)) {
      out.push({ key: `payroll:id:${id}`, kind: "invalid_id", severity: "error", subject: id, message: `ספרת הביקורת של מספר הזהות ${id} אינה תקינה — ${who}` });
    }
    if (e.grossWages > 0 && e.taxWithheld === 0 && e.niEmployee === 0 && e.pensionEmployee === 0 && e.grossWages > 30_000_00) {
      out.push({
        key: `payroll:nodeduct:${id}`,
        kind: "no_deductions",
        severity: "warning",
        subject: id,
        message: `${who}: שכר שנתי ${money(e.grossWages)} ללא מס, ביטוח לאומי או פנסיה — לבדוק אם זה עובד אמיתי ומדוע אין ניכויים`,
        amount: e.grossWages,
      });
    }
    if (e.monthsWorked > 12 || e.monthsWorked < 0) {
      out.push({ key: `payroll:months:${id}`, kind: "months_out_of_range", severity: "error", subject: id, message: `${who}: דווחו ${e.monthsWorked} חודשי עבודה` });
    }
    if (e.grossWages > 0 && e.monthsWorked === 0) {
      out.push({ key: `payroll:nomonths:${id}`, kind: "wages_without_months", severity: "warning", subject: id, message: `${who}: שכר ${money(e.grossWages)} עם 0 חודשי עבודה`, amount: e.grossWages });
    }
    if (e.startDate && e.endDate && e.endDate < e.startDate) {
      out.push({ key: `payroll:dates:${id}`, kind: "dates_inconsistent", severity: "error", subject: id, message: `${who}: תאריך סיום (${e.endDate}) לפני תאריך תחילה (${e.startDate})` });
    }
    if (e.endDate && e.endDate < yearStart && e.grossWages > 0) {
      out.push({
        key: `payroll:left:${id}`,
        kind: "left_before_year",
        severity: "warning",
        subject: id,
        message: `${who}: סיים לעבוד ב־${e.endDate} אך קיבל שכר ${money(e.grossWages)} בשנת ${taxYear} — גמר חשבון מאוחר, או תשלום לעובד שעזב`,
        amount: e.grossWages,
      });
    }
    if (e.startDate && e.endDate && e.endDate >= e.startDate && e.startDate >= yearStart && e.endDate <= yearEnd) {
      const span = monthsBetween(e.startDate.slice(0, 7), e.endDate.slice(0, 7));
      if (e.monthsWorked > span) {
        out.push({ key: `payroll:span:${id}`, kind: "dates_inconsistent", severity: "warning", subject: id, message: `${who}: ${e.monthsWorked} חודשי עבודה אך תקופת ההעסקה ${e.startDate}–${e.endDate} היא ${span} חודשים` });
      }
    }
    if (e.niWages > e.grossWages + e.benefitsInKind + 1_00 && e.grossWages > 0) {
      out.push({ key: `payroll:niwages:${id}`, kind: "ni_wages_exceed_gross", severity: "warning", subject: id, message: `${who}: שכר לביטוח לאומי ${money(e.niWages)} גבוה מהברוטו ${money(e.grossWages + e.benefitsInKind)}` });
    }
    if (e.taxWithheld > e.grossWages + e.benefitsInKind && e.grossWages > 0) {
      out.push({ key: `payroll:tax:${id}`, kind: "tax_exceeds_wages", severity: "error", subject: id, message: `${who}: המס שנוכה ${money(e.taxWithheld)} גבוה מהשכר` });
    }
    if (p95 !== null && e.grossWages >= p95 && e.grossWages > median * 3) {
      out.push({ key: `payroll:outlier:${id}`, kind: "high_wage_outlier", severity: "info", subject: id, message: `${who}: שכר שנתי ${money(e.grossWages)} — מעל 95% מהעובדים ופי 3 מהחציון; לאמת מול חוזה`, amount: e.grossWages });
    }
    if (e.monthsWorked === 1 && e.grossWages > 0) {
      out.push({ key: `payroll:single:${id}`, kind: "single_month", severity: "info", subject: id, message: `${who}: חודש עבודה יחיד בשנה (${money(e.grossWages)}) — לאמת מול חוזה / תיק אישי`, amount: e.grossWages });
    }
    // צו ההרחבה: אחרי 6 חודשי עבודה חובה להפריש לפנסיה
    const tenureMonths = e.startDate ? monthsBetween(e.startDate.slice(0, 7), `${taxYear}-12`) : null;
    if (e.grossWages > 0 && e.pensionEmployer === 0 && e.severanceEmployer === 0 && (tenureMonths === null || tenureMonths > 6) && e.monthsWorked >= 6) {
      out.push({
        key: `payroll:pension:${id}`,
        kind: "pension_missing",
        severity: "warning",
        subject: id,
        message: `${who}: ${e.monthsWorked} חודשי עבודה ללא הפרשות מעסיק לפנסיה או לפיצויים — חובה לפי צו ההרחבה אחרי 6 חודשים (אלא אם מדובר בפנסיונר או בבעל שליטה עם הסדר אחר)`,
        amount: e.grossWages,
      });
    }
  }
  return out;
}

export function checkMonths(months: PayrollMonth[], employees: PayrollEmployeeYear[], taxYear: number): PayrollFinding[] {
  const out: PayrollFinding[] = [];
  const distinct = new Set(months.map((m) => m.month));
  if (months.length > 0 && distinct.size !== 12) {
    out.push({ key: "payroll:monthcount", kind: "month_count", severity: "warning", subject: String(taxYear), message: `בקובץ ${distinct.size} חודשי דיווח במקום 12` });
  }
  if (months.length > 0 && employees.length > 0) {
    const pairs: [string, Agorot, Agorot][] = [
      // טור ד' ב־102 מול צבירת שדה 39 (שכר) — אותה השוואה שהמפרט עושה ברשומה 40; השווי אינו חלק מהשכר שבטור ד'
      ["שכר", months.reduce((s, m) => s + m.wagesTaxable, 0), employees.reduce((s, e) => s + e.grossWages, 0)],
      ["מס שנוכה", months.reduce((s, m) => s + m.taxWithheld, 0), employees.reduce((s, e) => s + e.taxWithheld, 0)],
    ];
    for (const [label, monthly, yearly] of pairs) {
      const diff = monthly - yearly;
      if (Math.abs(diff) > Math.max(1_00 * employees.length, Math.round(yearly * 0.001))) {
        out.push({
          key: `payroll:m-vs-e:${label}`,
          kind: "months_vs_employees",
          severity: "warning",
          subject: label,
          message: `${label}: סיכום 12 הדיווחים החודשיים (102) ${money(monthly)} שונה מסיכום רשומות העובדים ${money(yearly)} — הפרש ${money(diff)}. סיבות אפשריות: משכורת 13, הפרשי שכר, תיקוני דיווח`,
          amount: diff,
        });
      }
    }
  }
  // חודש חריג בעלות: מעל ממוצע + 2 סטיות תקן (ובנטרול חודש בודד חריג מהממוצע עצמו)
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length >= 6) {
    const vals = sorted.map((m) => m.wagesTaxable);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    for (const m of sorted) {
      if (sd > 0 && m.wagesTaxable > mean + 2 * sd && m.wagesTaxable > mean * 1.2) {
        out.push({
          key: `payroll:spike:${m.month}`,
          kind: "month_spike",
          severity: "info",
          subject: m.month,
          message: `${m.month}: שכר ${money(m.wagesTaxable)} לעומת ממוצע חודשי ${money(Math.round(mean))} — הבראה, בונוסים או משכורת 13? לתעד`,
          amount: m.wagesTaxable - Math.round(mean),
        });
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].employeeCount;
      const cur = sorted[i].employeeCount;
      if (prev >= 5 && Math.abs(cur - prev) / prev > 0.2) {
        out.push({
          key: `payroll:headcount:${sorted[i].month}`,
          kind: "employee_count_jump",
          severity: "info",
          subject: sorted[i].month,
          message: `${sorted[i].month}: ${cur} עובדים לעומת ${prev} בחודש הקודם — כניסות/עזיבות המוניות, לאמת`,
        });
      }
    }
  }
  return out;
}

export function runPayrollChecks(file: PayrollFile): PayrollFinding[] {
  const year = file.employer.taxYear;
  return [...checkEmployees(file.employees, year), ...checkMonths(file.months, file.employees, year)];
}

/** סיכומים לתצוגה */
export function summarizePayroll(file: PayrollFile) {
  const e = file.employees;
  const sum = (f: (x: PayrollEmployeeYear) => Agorot) => e.reduce((s, x) => s + f(x), 0);
  const gross = sum((x) => x.grossWages + x.benefitsInKind);
  const niEmployee = sum((x) => x.niEmployee);
  const niTotal = file.months.reduce((s, m) => s + m.niTotal, 0);
  return {
    employees: e.length,
    activeEmployees: e.filter((x) => x.grossWages > 0).length,
    gross,
    taxWithheld: sum((x) => x.taxWithheld),
    niEmployee,
    /** חלק המעסיק = סך דמי הביטוח ב־102 פחות מה שנוכה מהעובדים */
    niEmployer: niTotal > 0 ? niTotal - niEmployee : null,
    pensionEmployer: sum((x) => x.pensionEmployer),
    severanceEmployer: sum((x) => x.severanceEmployer),
    studyFundEmployer: sum((x) => x.studyFundEmployer),
    maxEmployeeCount: Math.max(0, ...file.months.map((m) => m.employeeCount)),
    avgMonthlyWage: file.months.length ? Math.round(file.months.reduce((s, m) => s + m.wagesTaxable, 0) / Math.max(1, file.months.reduce((s, m) => s + m.employeeCount, 0))) : null,
  };
}
