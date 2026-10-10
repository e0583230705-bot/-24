import "server-only";
import {
  listBankStatements,
  listNotes,
  listWorkpapers,
  loadEngagementLedger,
  loadPayments,
  loadPayroll,
  loadPayslips,
  WORKPAPER_AREAS,
  type WorkpaperAreaKey,
} from "@/lib/services/audit";
import { trialBalance, unbalancedEntries } from "@/lib/domain/ledger/trial-balance";
import { testJournalEntries } from "@/lib/domain/ledger/journal-tests";
import { benford, CONFORMITY_LABELS } from "@/lib/domain/ledger/benford";
import { computeMateriality } from "@/lib/domain/ledger/materiality";
import { compareYears } from "@/lib/domain/ledger/analytics";
import { collectFindings, findingsByArea } from "@/lib/domain/audit/findings";
import type { PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import { payrollStatus } from "./payroll-tab";
import type { WorkpaperAreaInfo } from "./workpapers-view";

export type Tone = "good" | "warn" | "bad" | "muted";

export const AREA_LABELS: Record<WorkpaperAreaKey, string> = {
  tb: "מאזן בוחן",
  je: "פקודות חריגות",
  analytics: "סקירה אנליטית",
  recon: "התאמות",
  benford: "חוק בנפורד",
  sample: "מדגם",
  payroll: "שכר",
};

/**
 * כל מה שדף התיק, ניירות העבודה, המכתב והייצוא צריכים — במקום אחד, כדי שהמספרים יהיו זהים בכל מקום.
 * מחזיר null כשהתיק לא קיים או לא שייך למשרד.
 */
export async function loadEngagementOverview(organizationId: string, id: string) {
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await loadEngagementLedger(organizationId, id) : null;
  if (!data) return null;
  const { engagement: e, accounts, lines } = data;
  const hasBooks = lines.length > 0;
  const materiality = e.materialityBase && e.materialityPct ? computeMateriality(e.materialityBase, e.materialityPct) : null;
  const [notes, statements, payroll, payslips, payments, workpapers] = await Promise.all([
    listNotes(organizationId, e.id),
    listBankStatements(organizationId, e.id),
    loadPayroll(organizationId, e.id),
    loadPayslips(organizationId, e.id),
    loadPayments(organizationId, e.id),
    listWorkpapers(organizationId, e.id),
  ]);

  // שורת סטטוס קצרה לכל בדיקה
  const status: Record<WorkpaperAreaKey, { text: string; tone: Tone }> = {
    tb: { text: "", tone: "muted" },
    je: { text: "", tone: "muted" },
    analytics: { text: "", tone: "muted" },
    recon: { text: "", tone: "muted" },
    benford: { text: "", tone: "muted" },
    sample: { text: "", tone: "muted" },
    payroll: payrollStatus(payroll?.file ?? null, payslips, materiality?.trivial ?? 1000_00),
  };
  if (hasBooks) {
    const tb = trialBalance(accounts, lines);
    const unbalanced = unbalancedEntries(lines).length;
    status.tb = tb.balanced && unbalanced === 0 ? { text: "מאוזן", tone: "good" } : { text: `${unbalanced} פקודות לא מאוזנות`, tone: "bad" };
    const flagged = testJournalEntries(lines, { yearEnd: e.yearEnd, performanceMateriality: materiality?.performance ?? Number.MAX_SAFE_INTEGER }).length;
    status.je = flagged === 0 ? { text: "לא נמצאו", tone: "good" } : { text: `${flagged} לבדיקה`, tone: "warn" };
    const b = benford(lines.filter((l) => l.amount > 0).map((l) => l.amount));
    status.benford = !b.reliable
      ? { text: "מעט מדי נתונים", tone: "muted" }
      : { text: CONFORMITY_LABELS[b.conformity], tone: b.conformity === "nonconformity" ? "bad" : b.conformity === "marginal" ? "warn" : "good" };
    if (!materiality) status.analytics = { text: "צריך מהותיות", tone: "muted" };
    else if (data.prior.lines.length === 0) status.analytics = { text: "צריך שנה קודמת", tone: "muted" };
    else {
      const rows = compareYears(data, data.prior, { performanceMateriality: materiality.performance, by: "account" }).filter((r) => r.flag);
      const explained = rows.filter((r) => notes.has(`analytics:${r.key}`)).length;
      status.analytics =
        rows.length === 0 ? { text: "אין שינויים מהותיים", tone: "good" } : { text: `${explained}/${rows.length} הוסברו`, tone: explained === rows.length ? "good" : "warn" };
    }
    status.recon = statements.length === 0 ? { text: "אין דפי בנק", tone: "muted" } : { text: `${statements.length} חשבונות בנק`, tone: "good" };
    status.sample = materiality ? { text: "מוכן לדגימה", tone: "good" } : { text: "צריך מהותיות", tone: "muted" };
  }

  const findings = collectFindings({
    fiscalYear: e.fiscalYear,
    yearEnd: e.yearEnd,
    current: { accounts, lines },
    prior: data.prior.lines.length ? data.prior : null,
    materiality: materiality ? { performance: materiality.performance, trivial: materiality.trivial } : null,
    payroll: payroll?.file ?? null,
    payslips: payslips?.rows ?? [],
    payments: payments?.rows ?? null,
    payrollMapping: (e.payrollConfig as PayrollAccountMap | null) ?? null,
  });
  const byArea = findingsByArea(findings, notes);
  const hasPayroll = Boolean(payroll) || Boolean(payslips?.rows.length);
  const areas: WorkpaperAreaInfo[] = WORKPAPER_AREAS.map((key) => ({
    key,
    label: AREA_LABELS[key],
    status: status[key],
    findings: byArea.get(key) ?? null,
    available: key === "payroll" ? hasPayroll : hasBooks,
  }));

  return { data, engagement: e, accounts, lines, hasBooks, hasPayroll, materiality, notes, statements, payroll, payslips, payments, workpapers, status, findings, areas };
}
