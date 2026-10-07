import { formatILS } from "@/lib/format";
import type { PayrollFile } from "@/lib/domain/payroll/types";
import { PAYSLIP_FIELDS, type PayslipColumnMap, type PayslipField, type PayslipRow, type PayslipTable } from "@/lib/domain/payroll/payslips";
import { checkPayslipRows, comparePayslipsToForm126, PAYSLIP_FINDING_LABELS, payslipMonths, type PayslipFinding } from "@/lib/domain/payroll/payslip-checks";
import { NoteForm } from "@/components/audit-forms";
import { PayslipMappingForm, PayslipsImportForm } from "@/components/payroll-forms";
import { Collapsible } from "@/components/page-header";
import { Icons } from "@/components/icons";
import { importPayslipsAction, saveNoteAction, setPayslipMappingAction } from "@/app/actions";

export interface PayslipsData {
  table: PayslipTable;
  mapping: PayslipColumnMap;
  rows: PayslipRow[];
  skipped: number;
  issues: { severity: "error" | "warning"; message: string }[];
  filename: string;
}

/** סטטוס לאריח: משקלל גם את התלושים */
export function payslipsStatus(data: PayslipsData | null, payroll: PayrollFile | null, tolerance: number) {
  if (!data || data.rows.length === 0) return null;
  const findings = [...checkPayslipRows(data.rows), ...(payroll ? comparePayslipsToForm126(data.rows, payroll, tolerance) : [])];
  return { errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length };
}

const SEVERITY: Record<PayslipFinding["severity"], { label: string; badge: string }> = {
  error: { label: "שגיאה", badge: "badge-bad" },
  warning: { label: "לבדיקה", badge: "badge-warn" },
  info: { label: "לידיעה", badge: "badge-muted" },
};

export function PayslipsSection({
  engagementId,
  fiscalYear,
  data,
  payroll,
  tolerance,
  notes,
  write,
}: {
  engagementId: string;
  fiscalYear: number;
  data: PayslipsData | null;
  payroll: PayrollFile | null;
  tolerance: number;
  notes: Map<string, { text: string; author: string | null; updatedAt: Date }>;
  write: boolean;
}) {
  const noteProps = (key: string) => {
    const n = notes.get(key);
    return { initial: n?.text, meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined };
  };
  const fields = (Object.keys(PAYSLIP_FIELDS) as PayslipField[]).map((k) => ({ key: k, label: PAYSLIP_FIELDS[k].label, required: PAYSLIP_FIELDS[k].required }));
  const mappingIncomplete = data !== null && data.rows.length === 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bubble bg-teal-soft text-teal">
          <Icons.fileText size={20} />
        </span>
        <div>
          <h2 className="card-title">ריכוז שכר חודשי (תלושים)</h2>
          <p className="text-xs text-muted">אקסל או CSV מתוכנת השכר: שורה לכל עובד־חודש. פותח בדיקות חודשיות, פרטניות והשוואה ל־126.</p>
        </div>
      </div>

      {write && (
        <Collapsible title={data ? `הקובץ: ${data.filename}` : "קליטת ריכוז שכר"} description={data ? `${data.table.rows.length.toLocaleString("he-IL")} שורות · ${data.table.headers.length} עמודות${data.table.sheet ? ` · גיליון "${data.table.sheet}"` : ""}` : "ייצוא \"ריכוז שכר\" / \"דוח תלושים\" מכל תוכנת שכר"} open={!data}>
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">
              בתוכנת השכר מפיקים דוח ריכוז שכר שנתי עם שורה לכל עובד בכל חודש, ומייצאים לאקסל. עמודות מומלצות: מספר זהות,
              שם, חודש, שכר יסוד, שעות, שעות נוספות, ברוטו, מס הכנסה, ביטוח לאומי, בריאות, פנסיה עובד/מעסיק, פיצויים, נטו,
              חשבון בנק, תאריכי תחילה וסיום. המערכת מזהה את העמודות לפי הכותרות, ואפשר לתקן.
            </p>
            <PayslipsImportForm action={importPayslipsAction.bind(null, engagementId)} hasFile={Boolean(data)} />
          </div>
        </Collapsible>
      )}

      {data && (
        <>
          {data.issues.map((i) => (
            <p key={i.message} className={`notice ${i.severity === "error" ? "notice-bad" : "notice-warn"}`}>
              {i.message}
            </p>
          ))}
          {write && (
            <Collapsible title="מיפוי העמודות" description={`${Object.keys(data.mapping).length} שדות ממופים · ${data.table.headers.filter((_, i) => !Object.values(data.mapping).includes(i)).length} עמודות לא בשימוש`} open={mappingIncomplete}>
              <div className="space-y-3">
                <PayslipMappingForm action={setPayslipMappingAction.bind(null, engagementId)} headers={data.table.headers} mapping={data.mapping} fields={fields} />
                <UnusedHeaders headers={data.table.headers} mapping={data.mapping} />
              </div>
            </Collapsible>
          )}
          {data.rows.length > 0 && (
            <>
              <PayslipSummary rows={data.rows} skipped={data.skipped} />
              <PayslipFindings
                findings={[...checkPayslipRows(data.rows), ...(payroll ? comparePayslipsToForm126(data.rows, payroll, tolerance) : [])]}
                engagementId={engagementId}
                write={write}
                noteProps={noteProps}
                has126={Boolean(payroll)}
              />
              <MonthlyTable rows={data.rows} payroll={payroll} fiscalYear={fiscalYear} />
            </>
          )}
        </>
      )}
    </section>
  );
}

function UnusedHeaders({ headers, mapping }: { headers: string[]; mapping: PayslipColumnMap }) {
  const used = new Set(Object.values(mapping));
  const unused = headers.map((h, i) => ({ h, i })).filter(({ h, i }) => !used.has(i) && h);
  if (unused.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      עמודות שלא מופו: {unused.map(({ h }) => h).join(" · ")}
    </p>
  );
}

function PayslipSummary({ rows, skipped }: { rows: PayslipRow[]; skipped: number }) {
  const employees = new Set(rows.map((r) => r.taxId)).size;
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const months = new Set(rows.map((r) => r.month)).size;
  const stat = (label: string, value: string) => (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="num text-right text-xl font-extrabold">{value}</p>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stat("תלושים", `${rows.length.toLocaleString("he-IL")}${skipped ? ` (+${skipped} דולגו)` : ""}`)}
      {stat("עובדים", String(employees))}
      {stat("חודשים", String(months))}
      {stat("ברוטו / נטו", `${formatILS(gross)} / ${formatILS(net)}`)}
    </div>
  );
}

function PayslipFindings({
  findings,
  engagementId,
  write,
  noteProps,
  has126,
}: {
  findings: PayslipFinding[];
  engagementId: string;
  write: boolean;
  noteProps: (key: string) => { initial?: string; meta?: string };
  has126: boolean;
}) {
  const groups = new Map<string, PayslipFinding[]>();
  for (const f of findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);
  const order: PayslipFinding["severity"][] = ["error", "warning", "info"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[1][0].severity) - order.indexOf(b[1][0].severity));
  return (
    <div className="space-y-3">
      <h3 className="font-bold">ממצאים מהתלושים</h3>
      {!has126 && <p className="text-xs text-muted">כשייקלט גם קובץ 126, יתווספו השוואות: תלושים מול 102 לכל חודש, ומול רשומת 126 לכל עובד.</p>}
      {findings.length === 0 && <p className="notice notice-good">לא נמצאו ממצאים בבדיקות על התלושים.</p>}
      {sorted.map(([kind, items]) => (
        <details key={kind} className="panel card p-0" open={items[0].severity === "error"}>
          <summary className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="flex items-center gap-2">
              <span className={`badge ${SEVERITY[items[0].severity].badge}`}>{SEVERITY[items[0].severity].label}</span>
              <span className="font-bold">{PAYSLIP_FINDING_LABELS[kind as PayslipFinding["kind"]]}</span>
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
      <p className="text-xs text-muted">⚠ בדיקות שנשענות על שכר מינימום, שיעורי ביטוח לאומי ושיעורי פנסיה משתמשות בטבלת פרמטרים שדורשת אימות של רואה חשבון.</p>
    </div>
  );
}

function MonthlyTable({ rows, payroll, fiscalYear }: { rows: PayslipRow[]; payroll: PayrollFile | null; fiscalYear: number }) {
  const months = payslipMonths(rows);
  const by102 = new Map((payroll?.months ?? []).map((m) => [m.month, m]));
  const hasTax = rows.some((r) => r.incomeTax !== null);
  return (
    <details className="panel table-wrap" open>
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="font-bold">
          לפי חודש · {fiscalYear}
          {payroll && <span className="ms-2 text-xs font-normal text-muted">מול דיווחי 102 שבקובץ 126</span>}
        </span>
        <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
      </summary>
      <table className="table border-t border-border">
        <thead>
          <tr>
            <th>חודש</th>
            <th className="text-end">תלושים</th>
            {payroll && <th className="text-end">עובדים ב־102</th>}
            <th className="text-end">ברוטו</th>
            {payroll && <th className="text-end">ברוטו ב־102</th>}
            {hasTax && <th className="text-end">מס</th>}
            {payroll && hasTax && <th className="text-end">מס ב־102</th>}
            <th className="text-end">נטו</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const f = by102.get(m.month);
            const grossDiff = f ? m.gross - f.wagesTaxable : 0;
            return (
              <tr key={m.month} className={f && Math.abs(grossDiff) > 1_00 ? "" : ""}>
                <td className="num">{m.month.split("-").reverse().join("/")}</td>
                <td className={`num text-end ${f && f.employeeCount !== m.employees ? "font-bold text-warn" : ""}`}>{m.employees}</td>
                {payroll && <td className="num text-end text-muted">{f ? f.employeeCount : "—"}</td>}
                <td className={`num text-end ${f && Math.abs(grossDiff) > 1_00 ? "font-bold text-danger" : ""}`}>{formatILS(m.gross)}</td>
                {payroll && <td className="num text-end text-muted">{f ? formatILS(f.wagesTaxable) : "—"}</td>}
                {hasTax && <td className="num text-end">{formatILS(m.incomeTax)}</td>}
                {payroll && hasTax && <td className="num text-end text-muted">{f ? formatILS(f.taxWithheld) : "—"}</td>}
                <td className="num text-end">{formatILS(m.net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
