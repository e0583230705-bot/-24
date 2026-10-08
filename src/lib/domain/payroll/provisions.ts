import type { Agorot } from "../money";
import type { LedgerAccount, LedgerLine } from "../ledger/types";
import type { PayslipRow } from "./payslips";
import type { PayrollEmployeeYear } from "./types";
import { accountMovements, type PayrollAccountMap } from "./ledger-reconciliation";
import { PENSION, recuperationDays, recuperationRateAt, VACATION_DAY_DIVISOR } from "./rates";

/**
 * הפרשות סוף שנה בשכר (בדיקות E2, E3, E5 במסמך המחקר): חישוב מחדש של ההתחייבויות לעובדים ליום המאזן,
 * מתוך התלושים, והשוואה ליתרות בספרים.
 *
 * - חופשה: יתרת הימים בתלוש האחרון × ערך יום (שכר חודשי ÷ 21.67).
 * - הבראה: הזכאות לשנה (ימים לפי ותק × תעריף × חלקיות משרה × חודשי עבודה בשנה ÷ 12) פחות מה ששולם בתלושים.
 * - פיצויים: שכר אחרון × שנות ותק × החלק שאינו מכוסה בהפקדות (לפי שיעור ההפקדה לפיצויים מתוך 8.33%).
 *
 * ⚠ אומדן לביקורת, לא חישוב משפטי: השיעורים והימים דורשים אימות רו"ח; שנת ההבראה בפועל אינה תמיד שנה קלנדרית;
 * בפיצויים ההנחה היא שההפקדות הן לפי סעיף 14 ושהשיעור היה זהה בכל שנות העבודה — יתרות הקופות (יעודה) אינן בנתונים.
 */

export interface EmployeeProvision {
  taxId: string;
  name: string;
  startDate: string | null;
  /** שנות ותק ליום המאזן */
  seniorityYears: number | null;
  /** השכר החודשי שעליו מחושב (שכר יסוד בתלוש האחרון, או ברוטו בניכוי שעות נוספות) */
  monthlyBase: Agorot;
  dailyValue: Agorot;
  vacationDays: number | null;
  vacation: Agorot | null;
  recuperationEntitled: Agorot | null;
  recuperationPaid: Agorot | null;
  recuperation: Agorot | null;
  /** שיעור ההפקדה לפיצויים מתוך השכר, באחוזים */
  severanceRate: number | null;
  severance: Agorot | null;
  notes: string[];
}

export type ProvisionFindingKind =
  | "prov_negative_vacation"
  | "prov_recuperation_unpaid"
  | "prov_no_severance_deposits"
  | "prov_partial_severance"
  | "prov_missing_start"
  | "prov_vs_books";

export const PROVISION_FINDING_LABELS: Record<ProvisionFindingKind, string> = {
  prov_negative_vacation: "יתרת חופשה שלילית",
  prov_recuperation_unpaid: "הבראה שלא שולמה עד סוף השנה",
  prov_no_severance_deposits: "עובד ותיק ללא הפקדות לפיצויים",
  prov_partial_severance: "הפקדה חלקית לפיצויים (פחות מ־8.33%)",
  prov_missing_start: "אין תאריך תחילת עבודה — לא ניתן לחשב ותק",
  prov_vs_books: "פער בין ההפרשה המחושבת ליתרה בספרים",
};

export interface ProvisionFinding {
  key: string;
  kind: ProvisionFindingKind;
  severity: "error" | "warning" | "info";
  subject: string;
  message: string;
  amount?: Agorot;
}

export interface ProvisionTotals {
  vacation: Agorot;
  recuperation: Agorot;
  severance: Agorot;
}

export interface ProvisionsResult {
  /** עובדים פעילים ליום המאזן (יש להם תלוש בדצמבר ולא סיימו) */
  employees: EmployeeProvision[];
  totals: ProvisionTotals;
  /** אילו נתונים חסרים בקובץ התלושים, ולכן חלק מהחישוב לא בוצע */
  missing: { vacationBalance: boolean; recuperationPay: boolean; severance: boolean; startDate: number };
  /** עובדים שסיימו במהלך השנה או שאין להם תלוש בדצמבר — לא נכללים */
  excluded: number;
}

const money = (a: Agorot) => (a / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪";
const DAY_MS = 86_400_000;

export function computeYearEndProvisions(
  rows: PayslipRow[],
  fiscalYear: number,
  opts: { employees126?: PayrollEmployeeYear[]; dayDivisor?: number } = {},
): ProvisionsResult {
  const yearEnd = `${fiscalYear}-12-31`;
  const december = `${fiscalYear}-12`;
  const divisor = opts.dayDivisor ?? VACATION_DAY_DIVISOR.fiveDayWeek;
  const start126 = new Map((opts.employees126 ?? []).filter((e) => e.startDate).map((e) => [e.taxId, e.startDate!]));
  const yearRows = rows.filter((r) => r.month.startsWith(`${fiscalYear}-`));
  const byEmployee = new Map<string, PayslipRow[]>();
  for (const r of yearRows) byEmployee.set(r.taxId, [...(byEmployee.get(r.taxId) ?? []), r]);

  const hasVacation = yearRows.some((r) => r.vacationBalance !== null);
  const hasRecuperation = yearRows.some((r) => r.recuperationPay !== null);
  const hasSeverance = yearRows.some((r) => r.severanceEmployer !== null);
  const rate = recuperationRateAt(yearEnd);

  const employees: EmployeeProvision[] = [];
  let excluded = 0;
  let missingStart = 0;

  for (const [taxId, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month) || a.line - b.line);
    const last = sorted[sorted.length - 1];
    const endDate = sorted.map((r) => r.endDate).find(Boolean) ?? null;
    if (last.month !== december || (endDate !== null && endDate <= yearEnd)) {
      excluded++;
      continue;
    }
    const notes: string[] = [];
    const startDate = sorted.map((r) => r.startDate).find(Boolean) ?? start126.get(taxId) ?? null;
    const seniorityYears = startDate ? Math.max(0, (Date.parse(yearEnd) - Date.parse(startDate)) / DAY_MS / 365.25) : null;
    if (seniorityYears === null) missingStart++;

    const baseOf = (r: PayslipRow) => r.baseSalary ?? r.gross - (r.overtimePay ?? 0);
    const monthlyBase = baseOf(last);
    const dailyValue = Math.round(monthlyBase / divisor);

    // חופשה
    const vacationDays = last.vacationBalance;
    const vacation = vacationDays === null ? null : Math.round(Math.max(0, vacationDays) * dailyValue);

    // הבראה
    let recuperationEntitled: Agorot | null = null;
    let recuperationPaid: Agorot | null = null;
    let recuperation: Agorot | null = null;
    if (seniorityYears !== null && rate !== null) {
      const employmentYear = Math.floor(seniorityYears) + 1;
      const pcts = sorted.map((r) => r.jobPercent).filter((p): p is number => p !== null && p > 0);
      const jobShare = pcts.length ? Math.min(1, pcts.reduce((s, p) => s + p, 0) / pcts.length / 100) : 1;
      const monthsInYear = new Set(sorted.map((r) => r.month)).size;
      recuperationEntitled = Math.round(recuperationDays(employmentYear) * rate * jobShare * (monthsInYear / 12));
      if (employmentYear === 1) notes.push("שנה ראשונה: ההבראה נצברת ומשולמת בתום השנה");
      if (hasRecuperation) {
        recuperationPaid = sorted.reduce((s, r) => s + (r.recuperationPay ?? 0), 0);
        recuperation = Math.max(0, recuperationEntitled - recuperationPaid);
      }
    }

    // פיצויים
    let severanceRate: number | null = null;
    let severance: Agorot | null = null;
    if (hasSeverance && seniorityYears !== null) {
      const base = sorted.reduce((s, r) => s + baseOf(r), 0);
      const deposited = sorted.reduce((s, r) => s + (r.severanceEmployer ?? 0), 0);
      severanceRate = base > 0 ? Math.round((deposited / base) * 10_000) / 100 : 0;
      // מעל 8.2% נחשב כיסוי מלא (עיגולים); אחרת החלק הלא מכוסה
      const coverage = severanceRate >= 8.2 ? 1 : Math.min(1, severanceRate / PENSION.severanceFull);
      severance = Math.round(monthlyBase * seniorityYears * (1 - coverage));
    }

    employees.push({
      taxId,
      name: last.name,
      startDate,
      seniorityYears: seniorityYears === null ? null : Math.round(seniorityYears * 100) / 100,
      monthlyBase,
      dailyValue,
      vacationDays,
      vacation,
      recuperationEntitled,
      recuperationPaid,
      recuperation,
      severanceRate,
      severance,
      notes,
    });
  }

  employees.sort((a, b) => (b.vacation ?? 0) + (b.recuperation ?? 0) + (b.severance ?? 0) - ((a.vacation ?? 0) + (a.recuperation ?? 0) + (a.severance ?? 0)));
  const sum = (f: (e: EmployeeProvision) => Agorot | null) => employees.reduce((s, e) => s + (f(e) ?? 0), 0);
  return {
    employees,
    totals: { vacation: sum((e) => e.vacation), recuperation: sum((e) => e.recuperation), severance: sum((e) => e.severance) },
    missing: { vacationBalance: !hasVacation, recuperationPay: !hasRecuperation, severance: !hasSeverance, startDate: missingStart },
    excluded,
  };
}

/** ממצאים פרטניים מהחישוב */
export function provisionFindings(result: ProvisionsResult): ProvisionFinding[] {
  const out: ProvisionFinding[] = [];
  for (const e of result.employees) {
    const who = `${e.name || e.taxId} (${e.taxId})`;
    if (e.vacationDays !== null && e.vacationDays < 0) {
      out.push({ key: `prov:${e.taxId}:vacation-negative`, kind: "prov_negative_vacation", severity: "warning", subject: e.taxId, message: `${who}: יתרת חופשה ${e.vacationDays} ימים בתלוש דצמבר — ניצול מעבר לצבירה` });
    }
    if (e.recuperation !== null && e.recuperation > 0 && e.seniorityYears !== null && e.seniorityYears >= 1) {
      out.push({
        key: `prov:${e.taxId}:recuperation`,
        kind: "prov_recuperation_unpaid",
        severity: "warning",
        subject: e.taxId,
        amount: e.recuperation,
        message: `${who}: זכאות להבראה ≈ ${money(e.recuperationEntitled ?? 0)}, שולם ${money(e.recuperationPaid ?? 0)} — יתרה ${money(e.recuperation)} צריכה להופיע בהפרשה`,
      });
    }
    if (e.severanceRate !== null && e.seniorityYears !== null && e.seniorityYears >= 0.5) {
      if (e.severanceRate === 0) {
        out.push({
          key: `prov:${e.taxId}:severance-none`,
          kind: "prov_no_severance_deposits",
          severity: "warning",
          subject: e.taxId,
          amount: e.severance ?? undefined,
          message: `${who}: ותק ${e.seniorityYears.toFixed(1)} שנים בלי הפקדות לפיצויים בשנה — התחייבות מלאה ≈ ${money(e.severance ?? 0)}`,
        });
      } else if (e.severanceRate < 8.2) {
        out.push({
          key: `prov:${e.taxId}:severance-partial`,
          kind: "prov_partial_severance",
          severity: "info",
          subject: e.taxId,
          amount: e.severance ?? undefined,
          message: `${who}: הפקדה לפיצויים ${e.severanceRate}% מהשכר — החלק הלא מכוסה ≈ ${money(e.severance ?? 0)}`,
        });
      }
    }
    if (e.startDate === null) {
      out.push({ key: `prov:${e.taxId}:no-start`, kind: "prov_missing_start", severity: "info", subject: e.taxId, message: `${who}: אין תאריך תחילת עבודה בתלושים או בקובץ 126 — ההבראה והפיצויים לא חושבו` });
    }
  }
  return out;
}

export interface ProvisionBooksRow {
  group: "vacationProvision" | "severanceLiability";
  label: string;
  computed: Agorot | null;
  books: Agorot | null;
  diff: Agorot | null;
  accounts: string[];
  status: "ok" | "diff" | "unmapped" | "na";
}

/**
 * השוואה ליתרות בספרים ליום המאזן. חופשה והבראה מושוות יחד (בדרך כלל חשבון אחד או שניים באותה קבוצה).
 * פער נחשב מהותי מעל הגבוה מבין הסובלנות ו־10% מהסכום המחושב — זו הפרשה מבוססת אומדן.
 */
export function compareProvisionsToBooks(
  result: ProvisionsResult,
  accounts: LedgerAccount[],
  lines: LedgerLine[],
  mapping: PayrollAccountMap,
  opts: { from: string; to: string; tolerance: Agorot },
): ProvisionBooksRow[] {
  const mv = accountMovements(accounts, lines, opts.from, opts.to);
  // יתרת זכות כמספר חיובי (0 − ולא מינוס אונרי, כדי לא לקבל ‎-0)
  const closing = (codes: string[]) => 0 - codes.reduce((s, c) => s + (mv.get(c)?.closing ?? 0), 0);
  const vacationComputed =
    result.missing.vacationBalance && result.missing.recuperationPay ? null : result.totals.vacation + result.totals.recuperation;
  const severanceComputed = result.missing.severance ? null : result.totals.severance;
  const row = (group: ProvisionBooksRow["group"], label: string, computed: Agorot | null): ProvisionBooksRow => {
    const codes = mapping[group] ?? [];
    if (computed === null) return { group, label, computed, books: codes.length ? closing(codes) : null, diff: null, accounts: codes, status: "na" };
    if (codes.length === 0) return { group, label, computed, books: null, diff: null, accounts: codes, status: "unmapped" };
    const books = closing(codes);
    const diff = books - computed;
    const threshold = Math.max(opts.tolerance, Math.round(Math.abs(computed) * 0.1));
    return { group, label, computed, books, diff, accounts: codes, status: Math.abs(diff) <= threshold ? "ok" : "diff" };
  };
  return [row("vacationProvision", "חופשה והבראה", vacationComputed), row("severanceLiability", "פיצויים (התחייבות נטו)", severanceComputed)];
}
