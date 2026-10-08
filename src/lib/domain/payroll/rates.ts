import type { Agorot } from "../money";

/**
 * פרמטרים חוקיים לבדיקות שכר, עם תוקף תאריכי. החישוב תמיד לפי חודש התלוש.
 * ⚠ המספרים נאספו ממקורות משניים ברשת (ראו docs/research/payroll-data-landscape.md) ו**דורשים אימות של רואה חשבון**
 * לפני שמסתמכים עליהם בחוות דעת. כל ממצא שנשען עליהם מסומן בהתאם.
 */

interface Dated<T> {
  /** YYYY-MM-DD, כולל */
  from: string;
  value: T;
}

const pick = <T>(table: Dated<T>[], date: string): T | null => {
  let found: T | null = null;
  for (const row of table) if (row.from <= date) found = row.value;
  return found;
};

/** שכר מינימום: לחודש (182 שעות) ולשעה, באגורות */
export const MINIMUM_WAGE: Dated<{ monthly: Agorot; hourly: Agorot }>[] = [
  { from: "2023-04-01", value: { monthly: 5_571_75, hourly: 30_61 } },
  { from: "2024-04-01", value: { monthly: 5_880_02, hourly: 32_30 } },
  { from: "2025-04-01", value: { monthly: 6_247_67, hourly: 34_32 } },
  { from: "2026-04-01", value: { monthly: 6_443_85, hourly: 35_40 } },
];

export function minimumWageAt(month: string) {
  return pick(MINIMUM_WAGE, `${month}-01`);
}

/** צו ההרחבה לפנסיה חובה (מ־1.1.2017): שיעורים באחוזים מהשכר הקובע */
export const PENSION = { employee: 6, employer: 6.5, severance: 6, severanceFull: 8.33, waitingMonthsNewEmployee: 6 } as const;

/** ביטוח לאומי + בריאות לשכיר תושב (18 עד גיל פרישה): שיעור מופחת עד המדרגה, מלא מעליה — באחוזים */
export const NATIONAL_INSURANCE: Dated<{
  reducedCeiling: Agorot;
  maxIncome: Agorot;
  employeeReduced: number;
  employeeFull: number;
  employerReduced: number;
  employerFull: number;
}>[] = [
  { from: "2024-01-01", value: { reducedCeiling: 7_122_00, maxIncome: 49_030_00, employeeReduced: 3.5, employeeFull: 12.0, employerReduced: 3.55, employerFull: 7.6 } },
  { from: "2025-01-01", value: { reducedCeiling: 7_522_00, maxIncome: 50_695_00, employeeReduced: 4.27, employeeFull: 12.17, employerReduced: 4.51, employerFull: 7.6 } },
  { from: "2026-01-01", value: { reducedCeiling: 7_703_00, maxIncome: 51_910_00, employeeReduced: 4.27, employeeFull: 12.17, employerReduced: 4.51, employerFull: 7.6 } },
];

export function nationalInsuranceAt(month: string) {
  return pick(NATIONAL_INSURANCE, `${month}-01`);
}

/** דמי הביטוח הצפויים מהעובד (ב"ל + בריאות) על שכר חודשי, באגורות */
export function expectedEmployeeNi(month: string, niWages: Agorot): Agorot | null {
  const r = nationalInsuranceAt(month);
  if (!r) return null;
  const capped = Math.min(niWages, r.maxIncome);
  const reduced = Math.min(capped, r.reducedCeiling);
  const full = Math.max(0, capped - r.reducedCeiling);
  return Math.round((reduced * r.employeeReduced + full * r.employeeFull) / 100);
}

/**
 * דמי הבראה — מגזר פרטי (צו ההרחבה): ימים לפי שנת העבודה, ותעריף ליום. ⚠ לאימות רו"ח.
 * הזכאות מתחילה אחרי שנת עבודה מלאה; בשנה הראשונה הזכות נצברת ומשולמת בתומה.
 */
export const RECUPERATION_DAY_RATE: Dated<Agorot>[] = [
  { from: "2023-01-01", value: 418_00 },
  { from: "2026-01-01", value: 451_50 },
];

export function recuperationRateAt(date: string) {
  return pick(RECUPERATION_DAY_RATE, date);
}

/** ימי הבראה בשנה לפי שנת העבודה (1 = השנה הראשונה) */
export function recuperationDays(employmentYear: number): number {
  if (employmentYear <= 1) return 5;
  if (employmentYear <= 3) return 6;
  if (employmentYear <= 10) return 7;
  if (employmentYear <= 15) return 8;
  if (employmentYear <= 19) return 9;
  return 10;
}

/** ערך יום חופשה: שכר חודשי חלקי ימי העבודה בחודש — 21.67 בשבוע של 5 ימים, 25 בשבוע של 6 ימים. ⚠ לאימות רו"ח */
export const VACATION_DAY_DIVISOR = { fiveDayWeek: 21.67, sixDayWeek: 25 } as const;

/** חוק שעות עבודה ומנוחה: שעתיים ראשונות 125%, מעבר 150%; עד 16 שעות נוספות בשבוע (≈ 70 בחודש) */
export const OVERTIME = { firstTwoHoursRate: 1.25, beyondRate: 1.5, maxMonthlyOvertimeHours: 70, monthlyHours: 182 } as const;
