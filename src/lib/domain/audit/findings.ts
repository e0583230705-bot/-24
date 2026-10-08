import type { Agorot } from "../money";
import type { LedgerLine } from "../ledger/types";
import { unbalancedEntries } from "../ledger/trial-balance";
import { FLAG_LABELS, testJournalEntries } from "../ledger/journal-tests";
import { compareYears, type AccountWithGroup } from "../ledger/analytics";
import type { PayrollFile } from "../payroll/types";
import type { PayslipRow } from "../payroll/payslips";
import type { PaymentRow } from "../payroll/payments";
import { FINDING_LABELS, runPayrollChecks } from "../payroll/checks";
import { checkPayslipRows, comparePayslipsToForm126, PAYSLIP_FINDING_LABELS } from "../payroll/payslip-checks";
import { compareProvisionsToBooks, computeYearEndProvisions, PROVISION_FINDING_LABELS, provisionFindings } from "../payroll/provisions";
import { PAYMENT_FINDING_LABELS, reconcilePayments } from "../payroll/payments";
import { reconcilePayrollToLedger, suggestPayrollAccounts, type PayrollAccountMap } from "../payroll/ledger-reconciliation";
import type { LetterItem } from "./management-letter";

/**
 * איסוף כל הממצאים בתיק למקום אחד — לניירות העבודה ולמכתב להנהלה.
 * אותן פונקציות שהמסכים משתמשים בהן, כדי שהמספרים יהיו זהים בכל מקום.
 */

export type WorkpaperArea = "tb" | "je" | "analytics" | "recon" | "benford" | "sample" | "payroll";

export interface EngagementFinding extends LetterItem {
  area: WorkpaperArea;
}

type Period = { accounts: AccountWithGroup[]; lines: LedgerLine[] };

export interface FindingsInput {
  fiscalYear: number;
  yearEnd: string;
  current: Period;
  prior: Period | null;
  materiality: { performance: Agorot; trivial: Agorot } | null;
  payroll: PayrollFile | null;
  payslips: PayslipRow[];
  payments: PaymentRow[] | null;
  payrollMapping: PayrollAccountMap | null;
}

const money = (a: Agorot) => (a / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪";

export function collectFindings(input: FindingsInput): EngagementFinding[] {
  const out: EngagementFinding[] = [];
  const { current } = input;
  const tolerance = input.materiality?.trivial ?? 1000_00;
  const hasBooks = current.lines.length > 0;

  if (hasBooks) {
    for (const u of unbalancedEntries(current.lines)) {
      out.push({ area: "tb", kind: "tb_unbalanced", label: "פקודה לא מאוזנת", severity: "error", key: `tb:${u.entryId}`, message: `פקודה ${u.entryId} אינה מאוזנת (הפרש ${money(u.difference)})` });
    }
    const flagged = testJournalEntries(current.lines, {
      yearEnd: input.yearEnd,
      performanceMateriality: input.materiality?.performance ?? Number.MAX_SAFE_INTEGER,
    });
    for (const f of flagged) {
      out.push({
        area: "je",
        kind: "je_flagged",
        label: "פקודת יומן חריגה",
        severity: "warning",
        key: `je:${f.entryId}`,
        message: `פקודה ${f.entryId} (${f.date.split("-").reverse().join("/")}, ${money(Math.abs(f.total))}): ${f.flags.map((x) => FLAG_LABELS[x]).join(", ")}`,
      });
    }
    if (input.materiality && input.prior && input.prior.lines.length > 0) {
      const rows = compareYears(current, input.prior, { performanceMateriality: input.materiality.performance, by: "account" }).filter((r) => r.flag);
      for (const r of rows) {
        out.push({ area: "analytics", kind: "analytics_unexplained", label: "שינוי מהותי ביתרה", severity: "warning", key: `analytics:${r.key}`, message: `${r.label}: שינוי של ${money(r.change)} לעומת השנה הקודמת` });
      }
    }
  }

  // שכר
  if (input.payroll) {
    for (const f of runPayrollChecks(input.payroll)) out.push({ area: "payroll", kind: f.kind, label: FINDING_LABELS[f.kind], severity: f.severity, key: f.key, message: f.message });
    if (hasBooks) {
      const mapping = input.payrollMapping ?? suggestPayrollAccounts(current.accounts);
      const rows = reconcilePayrollToLedger(input.payroll, current.accounts, current.lines, mapping, { from: `${input.fiscalYear}-01-01`, to: `${input.fiscalYear}-12-31`, tolerance });
      for (const r of rows.filter((x) => x.status === "diff")) {
        out.push({
          area: "payroll",
          kind: "payroll_books_diff",
          label: "פער בין דוחות השכר לספרים",
          severity: "warning",
          key: `payroll:recon:${r.group}`,
          message: `${r.label}: לפי השכר ${money(r.payroll ?? 0)}, בספרים ${money(r.books ?? 0)} (פער ${money(r.diff ?? 0)})`,
        });
      }
    }
  }
  if (input.payslips.length > 0) {
    const ps = [...checkPayslipRows(input.payslips), ...(input.payroll ? comparePayslipsToForm126(input.payslips, input.payroll, tolerance) : [])];
    for (const f of ps) out.push({ area: "payroll", kind: f.kind, label: PAYSLIP_FINDING_LABELS[f.kind], severity: f.severity, key: f.key, message: f.message });

    const prov = computeYearEndProvisions(input.payslips, input.fiscalYear, { employees126: input.payroll?.employees });
    for (const f of provisionFindings(prov)) out.push({ area: "payroll", kind: f.kind, label: PROVISION_FINDING_LABELS[f.kind], severity: f.severity, key: f.key, message: f.message });
    if (hasBooks) {
      const mapping = input.payrollMapping ?? suggestPayrollAccounts(current.accounts);
      for (const r of compareProvisionsToBooks(prov, current.accounts, current.lines, mapping, { from: `${input.fiscalYear}-01-01`, to: `${input.fiscalYear}-12-31`, tolerance }).filter((x) => x.status === "diff")) {
        out.push({
          area: "payroll",
          kind: "prov_vs_books",
          label: PROVISION_FINDING_LABELS.prov_vs_books,
          severity: "warning",
          key: `payroll:prov:${r.group}`,
          message: `${r.label}: מחושב מהתלושים ${money(r.computed ?? 0)}, בספרים ${money(r.books ?? 0)} (פער ${money(r.diff ?? 0)})`,
        });
      }
    }
    if (input.payments && input.payments.length > 0) {
      const pay = reconcilePayments(input.payslips, input.payments, { tolerance: Math.min(tolerance, 1_00), fiscalYear: input.fiscalYear });
      for (const f of pay.findings) out.push({ area: "payroll", kind: f.kind, label: PAYMENT_FINDING_LABELS[f.kind], severity: f.severity, key: f.key, message: f.message });
    }
  }
  return out;
}

/** ספירה לכל תחום: ממצאים, וכמה מהם קיבלו הסבר (הערה) בתיק */
export function findingsByArea(findings: EngagementFinding[], notes: { has(key: string): boolean }) {
  const res = new Map<WorkpaperArea, { total: number; errors: number; explained: number }>();
  for (const f of findings) {
    const r = res.get(f.area) ?? { total: 0, errors: 0, explained: 0 };
    r.total++;
    if (f.severity === "error") r.errors++;
    if (notes.has(f.key)) r.explained++;
    res.set(f.area, r);
  }
  return res;
}
