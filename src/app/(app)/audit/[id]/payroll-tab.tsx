import { formatDate, formatILS } from "@/lib/format";
import type { LedgerAccount, LedgerLine } from "@/lib/domain/ledger/types";
import type { PayrollFile } from "@/lib/domain/payroll/types";
import { FINDING_LABELS, runPayrollChecks, summarizePayroll, type PayrollFinding } from "@/lib/domain/payroll/checks";
import {
  reconcilePayrollToLedger,
  suggestPayrollAccounts,
  type PayrollAccountMap,
} from "@/lib/domain/payroll/ledger-reconciliation";
import { NoteForm } from "@/components/audit-forms";
import { PayrollImportForm, PayrollMappingForm } from "@/components/payroll-forms";
import { Collapsible } from "@/components/page-header";
import { Icons } from "@/components/icons";
import { importPayrollAction, saveNoteAction, setPayrollConfigAction } from "@/app/actions";
import { PayslipsSection, payslipsStatus, type PayslipsData } from "./payslips-section";

type Notes = Map<string, { text: string; author: string | null; updatedAt: Date }>;

/** סטטוס קצר לאריח בסקירת התיק */
export function payrollStatus(payroll: PayrollFile | null, payslips: PayslipsData | null, tolerance: number): { text: string; tone: "good" | "warn" | "bad" | "muted" } {
  if (!payroll && !payslips) return { text: "אין קבצים", tone: "muted" };
  let errors = 0;
  let warnings = 0;
  if (payroll) {
    const findings = runPayrollChecks(payroll);
    errors += findings.filter((f) => f.severity === "error").length + payroll.issues.filter((i) => i.severity === "error").length;
    warnings += findings.filter((f) => f.severity === "warning").length;
  }
  const ps = payslipsStatus(payslips, payroll, tolerance);
  if (ps) {
    errors += ps.errors;
    warnings += ps.warnings;
  }
  if (errors > 0) return { text: `${errors} שגיאות`, tone: "bad" };
  if (warnings > 0) return { text: `${warnings} לבדיקה`, tone: "warn" };
  const parts = [payroll && `${payroll.employees.length} עובדים`, payslips && payslips.rows.length > 0 && `${payslips.rows.length} תלושים`].filter(Boolean);
  return { text: parts.join(" · ") || "נקלט", tone: "good" };
}

export function PayrollTab({
  engagementId,
  fiscalYear,
  payroll,
  filename,
  payslips,
  accounts,
  lines,
  mapping,
  tolerance,
  notes,
  write,
}: {
  engagementId: string;
  fiscalYear: number;
  payroll: PayrollFile | null;
  filename: string | null;
  payslips: PayslipsData | null;
  accounts: LedgerAccount[];
  lines: LedgerLine[];
  mapping: PayrollAccountMap | null;
  tolerance: number;
  notes: Notes;
  write: boolean;
}) {
  const noteProps = (key: string) => {
    const n = notes.get(key);
    return {
      initial: n?.text,
      meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined,
    };
  };

  return (
    <div className="space-y-6">
      {write && (
        <Collapsible
          title="קובץ 126 של הלקוח"
          description="הדיווח השנתי לרשות המסים: כל העובדים ו־12 הדיווחים החודשיים (102)"
          open={!payroll}
        >
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">
              בתוכנת השכר של הלקוח מפיקים את קובץ 126 לשידור (קובץ טקסט, רשומות של 966 תווים). המערכת קוראת אותו לפי
              המפרט הרשמי של רשות המסים לשנת {fiscalYear}, בודקת את שלמותו, ומריצה את הבדיקות.
            </p>
            <PayrollImportForm action={importPayrollAction.bind(null, engagementId)} hasFile={Boolean(payroll)} />
          </div>
        </Collapsible>
      )}

      {!payroll && !write && <p className="notice notice-info">עדיין לא נקלט קובץ 126 לתיק.</p>}
      {!payroll && write && <p className="text-xs text-muted">אפשר להתחיל גם מריכוז השכר (למטה) ולהוסיף את קובץ 126 אחר כך.</p>}

      {payroll && (
        <>
          <Summary payroll={payroll} filename={filename} />
          <FileIssues payroll={payroll} />
          <Findings findings={runPayrollChecks(payroll)} engagementId={engagementId} write={write} noteProps={noteProps} />
          <LedgerSection
            engagementId={engagementId}
            fiscalYear={fiscalYear}
            payroll={payroll}
            accounts={accounts}
            lines={lines}
            mapping={mapping}
            tolerance={tolerance}
            write={write}
            noteProps={noteProps}
          />
          <Months payroll={payroll} />
          <Employees payroll={payroll} />
        </>
      )}

      <PayslipsSection engagementId={engagementId} fiscalYear={fiscalYear} data={payslips} payroll={payroll} tolerance={tolerance} notes={notes} write={write} />
    </div>
  );
}

function Summary({ payroll, filename }: { payroll: PayrollFile; filename: string | null }) {
  const s = summarizePayroll(payroll);
  const stat = (label: string, value: string, tone: string) => (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`num text-right text-xl font-extrabold ${tone}`}>{value}</p>
    </div>
  );
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="badge badge-brand">{payroll.employer.name || "מעסיק"}</span>
        <span className="num">תיק ניכויים {payroll.employer.deductionsFileId}</span>
        {filename && <span className="num">· {filename}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stat("עובדים (עם שכר)", `${s.activeEmployees} / ${s.employees}`, "")}
        {stat("שכר ושווי (ברוטו)", formatILS(s.gross), "")}
        {stat("מס שנוכה", formatILS(s.taxWithheld), "")}
        {stat("ביטוח לאומי מעסיק", s.niEmployer === null ? "—" : formatILS(s.niEmployer), "")}
        {stat("פנסיה מעסיק", formatILS(s.pensionEmployer), "")}
        {stat("פיצויים", formatILS(s.severanceEmployer), "")}
        {stat("קרן השתלמות מעסיק", formatILS(s.studyFundEmployer), "")}
        {stat("שכר חודשי ממוצע לעובד", s.avgMonthlyWage === null ? "—" : formatILS(s.avgMonthlyWage), "")}
      </div>
    </section>
  );
}

function FileIssues({ payroll }: { payroll: PayrollFile }) {
  if (payroll.issues.length === 0) return <p className="notice notice-good">בדיקות השלמות של הקובץ עברו: הרשומות, הסיכומים וההתאמה המובנית 126 ↔ 102 תקינים.</p>;
  return (
    <div className="notice notice-warn">
      <p className="font-bold">בעיות בקובץ עצמו ({payroll.issues.length})</p>
      <ul className="mt-1 space-y-1">
        {payroll.issues.map((i) => (
          <li key={i.message} className={i.severity === "error" ? "text-danger" : ""}>
            {i.severity === "error" ? "✕" : "⚠"} {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

const SEVERITY: Record<PayrollFinding["severity"], { label: string; badge: string }> = {
  error: { label: "שגיאה", badge: "badge-bad" },
  warning: { label: "לבדיקה", badge: "badge-warn" },
  info: { label: "לידיעה", badge: "badge-muted" },
};

function Findings({
  findings,
  engagementId,
  write,
  noteProps,
}: {
  findings: PayrollFinding[];
  engagementId: string;
  write: boolean;
  noteProps: (key: string) => { initial?: string; meta?: string };
}) {
  const groups = new Map<string, PayrollFinding[]>();
  for (const f of findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);
  const order: PayrollFinding["severity"][] = ["error", "warning", "info"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[1][0].severity) - order.indexOf(b[1][0].severity));
  return (
    <section className="space-y-3">
      <h2 className="card-title">ממצאים מנתוני השכר</h2>
      {findings.length === 0 && <p className="notice notice-good">לא נמצאו ממצאים בבדיקות על קובץ השכר.</p>}
      {sorted.map(([kind, items]) => (
        <details key={kind} className="panel card p-0" open={items[0].severity === "error"}>
          <summary className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="flex items-center gap-2">
              <span className={`badge ${SEVERITY[items[0].severity].badge}`}>{SEVERITY[items[0].severity].label}</span>
              <span className="font-bold">{FINDING_LABELS[kind as PayrollFinding["kind"]]}</span>
              <span className="text-sm text-muted">· {items.length}</span>
            </span>
            <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {items.slice(0, 200).map((f) => (
              <li key={f.key} className="space-y-2 px-5 py-3 text-sm">
                <p>{f.message}</p>
                {write ? <NoteForm action={saveNoteAction.bind(null, engagementId, f.key)} {...noteProps(f.key)} /> : noteProps(f.key).initial && <p className="text-xs text-muted">{noteProps(f.key).initial}</p>}
              </li>
            ))}
            {items.length > 200 && <li className="px-5 py-2 text-xs text-muted">מוצגים 200 מתוך {items.length}</li>}
          </ul>
        </details>
      ))}
    </section>
  );
}

function LedgerSection({
  engagementId,
  fiscalYear,
  payroll,
  accounts,
  lines,
  mapping,
  tolerance,
  write,
  noteProps,
}: {
  engagementId: string;
  fiscalYear: number;
  payroll: PayrollFile;
  accounts: LedgerAccount[];
  lines: LedgerLine[];
  mapping: PayrollAccountMap | null;
  tolerance: number;
  write: boolean;
  noteProps: (key: string) => { initial?: string; meta?: string };
}) {
  if (accounts.length === 0) {
    return <p className="notice notice-info">כדי להתאים את השכר לספרים, קלטו קודם את ספרי הלקוח (שלב 1 בתיק).</p>;
  }
  const effective = mapping ?? suggestPayrollAccounts(accounts);
  const rows = reconcilePayrollToLedger(payroll, accounts, lines, effective, {
    from: `${fiscalYear}-01-01`,
    to: `${fiscalYear}-12-31`,
    tolerance,
  });
  const STATUS = {
    ok: { label: "מותאם", badge: "badge-good" },
    diff: { label: "הפרש", badge: "badge-bad" },
    unmapped: { label: "ללא מיפוי", badge: "badge-muted" },
    na: { label: "יתרה בלבד", badge: "badge-muted" },
  } as const;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title">שכר ↔ ספרים</h2>
        <span className="text-xs text-muted">
          סובלנות <span className="num">{formatILS(tolerance)}</span>
          {!mapping && " · מיפוי אוטומטי לפי שמות החשבונות"}
        </span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>קבוצה</th>
              <th className="text-end">לפי השכר (126/102)</th>
              <th className="text-end">בספרים (תנועה בשנה)</th>
              <th className="text-end">הפרש</th>
              <th className="text-end">יתרה 31.12</th>
              <th>מצב</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.group} className={r.status === "diff" ? "" : r.status === "ok" ? "" : "text-muted"}>
                <td>
                  <p className="font-medium text-text">{r.label}</p>
                  <p className="num text-xs text-muted">{r.accounts.join(", ") || "—"}</p>
                  {r.note && r.status !== "ok" && <p className="mt-1 text-xs text-muted">{r.note}</p>}
                  {r.status === "diff" && write && (
                    <div className="mt-2">
                      <NoteForm action={saveNoteAction.bind(null, engagementId, `payroll:recon:${r.group}`)} {...noteProps(`payroll:recon:${r.group}`)} />
                    </div>
                  )}
                </td>
                <td className="num text-end">{r.payroll === null ? "—" : formatILS(r.payroll)}</td>
                <td className="num text-end">{r.books === null ? "—" : formatILS(r.books)}</td>
                <td className={`num text-end ${r.status === "diff" ? "font-bold text-danger" : ""}`}>{r.diff === null ? "—" : formatILS(r.diff)}</td>
                <td className="num text-end">
                  {r.closing === undefined ? "—" : formatILS(r.closing)}
                  {r.expectedClosing !== undefined && r.expectedClosing !== null && (
                    <span className="block text-xs text-muted">צפוי ≈ {formatILS(r.expectedClosing)}</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {write && (
        <Collapsible title="מיפוי חשבונות השכר בספרים" description="איזה חשבון שייך לאיזו קבוצה" open={false}>
          <PayrollMappingForm action={setPayrollConfigAction.bind(null, engagementId)} accounts={accounts.map((a) => ({ code: a.code, name: a.name }))} mapping={effective} />
        </Collapsible>
      )}
    </section>
  );
}

function Months({ payroll }: { payroll: PayrollFile }) {
  const months = [...payroll.months].sort((a, b) => a.month.localeCompare(b.month));
  if (months.length === 0) return null;
  const totals = months.reduce(
    (t, m) => ({ wages: t.wages + m.wagesTaxable, tax: t.tax + m.taxWithheld, ni: t.ni + m.niTotal }),
    { wages: 0, tax: 0, ni: 0 },
  );
  return (
    <details className="panel table-wrap">
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="font-bold">דיווחים חודשיים (102) · {months.length}</span>
        <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
      </summary>
      <table className="table border-t border-border">
        <thead>
          <tr>
            <th>חודש</th>
            <th className="text-end">עובדים</th>
            <th className="text-end">שכר חייב מ״ה</th>
            <th className="text-end">מס שנוכה</th>
            <th className="text-end">דמי ביטוח (עובד + מעסיק)</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td className="num">{m.month.split("-").reverse().join("/")}</td>
              <td className="num text-end">{m.employeeCount}</td>
              <td className="num text-end">{formatILS(m.wagesTaxable)}</td>
              <td className="num text-end">{formatILS(m.taxWithheld)}</td>
              <td className="num text-end">{formatILS(m.niTotal)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td>סה״כ</td>
            <td />
            <td className="num text-end">{formatILS(totals.wages)}</td>
            <td className="num text-end">{formatILS(totals.tax)}</td>
            <td className="num text-end">{formatILS(totals.ni)}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}

function Employees({ payroll }: { payroll: PayrollFile }) {
  const employees = [...payroll.employees].sort((a, b) => b.grossWages - a.grossWages);
  return (
    <details className="panel table-wrap">
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="font-bold">עובדים · {employees.length}</span>
        <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
      </summary>
      <table className="table border-t border-border">
        <thead>
          <tr>
            <th>עובד</th>
            <th>ת.ז.</th>
            <th>תקופה</th>
            <th className="text-end">חודשים</th>
            <th className="text-end">ברוטו</th>
            <th className="text-end">מס</th>
            <th className="text-end">ב״ל עובד</th>
            <th className="text-end">פנסיה מעסיק</th>
            <th className="text-end">פיצויים</th>
          </tr>
        </thead>
        <tbody>
          {employees.slice(0, 500).map((e, i) => (
            <tr key={`${e.taxId}-${e.jobType}-${i}`}>
              <td>{`${e.firstName} ${e.lastName}`.trim() || "—"}</td>
              <td className="num">{e.taxId}</td>
              <td className="num whitespace-nowrap text-xs">
                {e.startDate ? formatDate(e.startDate) : "—"}
                {e.endDate && <> – {formatDate(e.endDate)}</>}
              </td>
              <td className="num text-end">{e.monthsWorked}</td>
              <td className="num text-end">{formatILS(e.grossWages + e.benefitsInKind)}</td>
              <td className="num text-end">{formatILS(e.taxWithheld)}</td>
              <td className="num text-end">{formatILS(e.niEmployee)}</td>
              <td className="num text-end">{formatILS(e.pensionEmployer)}</td>
              <td className="num text-end">{formatILS(e.severanceEmployer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {employees.length > 500 && <p className="p-3 text-xs text-muted">מוצגים 500 העובדים בעלי השכר הגבוה ביותר מתוך {employees.length}.</p>}
    </details>
  );
}
