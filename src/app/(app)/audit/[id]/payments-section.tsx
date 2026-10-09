import { formatILS } from "@/lib/format";
import type { PayslipRow, PayslipTable } from "@/lib/domain/payroll/payslips";
import {
  PAYMENT_FIELDS,
  PAYMENT_FINDING_LABELS,
  reconcilePayments,
  type PaymentColumnMap,
  type PaymentField,
  type PaymentFinding,
  type PaymentRow,
} from "@/lib/domain/payroll/payments";
import { NoteForm } from "@/components/audit-forms";
import { PayslipMappingForm, PayslipsImportForm } from "@/components/payroll-forms";
import { Collapsible } from "@/components/page-header";
import { Icons } from "@/components/icons";
import { importPaymentsAction, saveNoteAction, setPaymentsMappingAction } from "@/app/actions";

export interface PaymentsData {
  table: PayslipTable;
  mapping: PaymentColumnMap;
  rows: PaymentRow[];
  skipped: number;
  issues: { severity: "error" | "warning"; message: string }[];
  filename: string;
}

const SEVERITY: Record<PaymentFinding["severity"], { label: string; badge: string }> = {
  error: { label: "שגיאה", badge: "badge-bad" },
  warning: { label: "לבדיקה", badge: "badge-warn" },
  info: { label: "לידיעה", badge: "badge-muted" },
};

const fmtMonth = (m: string) => m.split("-").reverse().join("/");

/** העברות השכר בפועל מול הנטו בתלושים: עובדי רפאים, סכומים, חשבונות */
export function PaymentsSection({
  engagementId,
  fiscalYear,
  data,
  payslips,
  tolerance,
  notes,
  write,
}: {
  engagementId: string;
  fiscalYear: number;
  data: PaymentsData | null;
  payslips: PayslipRow[];
  tolerance: number;
  notes: Map<string, { text: string; author: string | null; updatedAt: Date }>;
  write: boolean;
}) {
  const noteProps = (key: string) => {
    const n = notes.get(key);
    return { initial: n?.text, meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined };
  };
  const fields = (Object.keys(PAYMENT_FIELDS) as PaymentField[]).map((k) => ({ key: k, label: PAYMENT_FIELDS[k].label, required: PAYMENT_FIELDS[k].required }));
  // העברה לעובד צריכה להיות שווה לנטו עד אגורות — לא לפי סף המהותיות של התיק
  const payTolerance = Math.min(tolerance, 1_00);
  const result = data && data.rows.length > 0 && payslips.length > 0 ? reconcilePayments(payslips, data.rows, { tolerance: payTolerance, fiscalYear }) : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bubble bg-pink-soft text-pink">
          <Icons.bank size={20} />
        </span>
        <div>
          <h2 className="card-title">תשלומי שכר בפועל (מס״ב) מול נטו</h2>
          <p className="text-xs text-muted">כל העברה מהבנק צריכה להגיע לעובד עם תלוש באותו חודש, בסכום הנטו ולחשבון שלו.</p>
        </div>
      </div>

      {write && (
        <Collapsible
          title={data ? `הקובץ: ${data.filename}` : "קליטת פירוט העברות"}
          description={data ? `${data.table.rows.length.toLocaleString("he-IL")} שורות · ${data.table.headers.length} עמודות` : "פירוט זיכויי מס״ב / העברות משכורת, מהבנק או מתוכנת השכר"}
          open={!data}
        >
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">
              באתר הבנק או בתוכנת השכר מפיקים את פירוט הזיכויים של העברות המשכורת לשנה, ומייצאים לאקסל או CSV. עמודות נדרשות:
              סכום, תאריך (או חודש שכר), ומספר זהות או חשבון בנק של המוטב. עדיף גם שם, בנק וסניף.
            </p>
            <PayslipsImportForm action={importPaymentsAction.bind(null, engagementId)} hasFile={Boolean(data)} labels={{ first: "קליטת העברות", aria: "פירוט העברות שכר" }} />
          </div>
        </Collapsible>
      )}

      {!data && !write && <p className="notice notice-info">עדיין לא נקלט פירוט העברות שכר לתיק.</p>}

      {data && (
        <>
          {data.issues.map((i) => (
            <p key={i.message} className={`notice ${i.severity === "error" ? "notice-bad" : "notice-warn"}`}>
              {i.message}
            </p>
          ))}
          {write && (
            <Collapsible title="מיפוי העמודות" description={`${Object.keys(data.mapping).length} שדות ממופים`} open={data.rows.length === 0}>
              <PayslipMappingForm
                action={setPaymentsMappingAction.bind(null, engagementId)}
                headers={data.table.headers}
                mapping={data.mapping}
                fields={fields}
                hint="* חובה: סכום, תאריך או חודש שכר, ומספר זהות או חשבון. חשבון יכול להיות בעמודה אחת (12-345-678901) או בשלוש: בנק, סניף, חשבון."
              />
            </Collapsible>
          )}
          {payslips.length === 0 && data.rows.length > 0 && <p className="notice notice-info">כדי להשוות, קלטו קודם את ריכוז השכר (התלושים) למעלה.</p>}
          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="העברות" value={data.rows.length.toLocaleString("he-IL")} hint={data.skipped ? `${data.skipped} שורות דולגו` : undefined} />
                <Stat label="הותאמו לתלוש" value={result.matched.toLocaleString("he-IL")} />
                <Stat label="בלי תלוש" value={String(result.unmatched)} tone={result.unmatched ? "text-danger" : ""} />
                <Stat label="מחוץ לתקופת התלושים" value={String(result.outOfRange)} hint="למשל העברה בינואר על שכר דצמבר הקודם" />
              </div>
              <Findings findings={result.findings} engagementId={engagementId} write={write} noteProps={noteProps} />
              <details className="panel table-wrap" open>
                <summary className="flex items-center justify-between gap-3 px-5 py-4">
                  <span className="font-bold">לפי חודש שכר · {fiscalYear}</span>
                  <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
                </summary>
                <table className="table border-t border-border">
                  <thead>
                    <tr>
                      <th>חודש</th>
                      <th className="text-end">תלושים</th>
                      <th className="text-end">נטו בתלושים</th>
                      <th className="text-end">הועבר</th>
                      <th className="text-end">פער</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.monthly.map((m) => {
                      const diff = m.paid - m.net;
                      return (
                        <tr key={m.month}>
                          <td className="num">{fmtMonth(m.month)}</td>
                          <td className="num text-end">{m.payslips}</td>
                          <td className="num text-end">{formatILS(m.net)}</td>
                          <td className="num text-end">{formatILS(m.paid)}</td>
                          <td className={`num text-end ${Math.abs(diff) > payTolerance ? "font-bold text-danger" : "text-muted"}`}>{formatILS(diff)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
              <p className="text-xs text-muted">
                שיוך העברה לחודש: לפי עמודת חודש השכר אם יש; אחרת, העברה עד ה־15 בחודש משויכת קודם לשכר של החודש הקודם. המוטב
                מזוהה לפי מספר זהות, ואם אין — לפי חשבון הבנק שבתלוש.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`num text-right text-xl font-extrabold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Findings({
  findings,
  engagementId,
  write,
  noteProps,
}: {
  findings: PaymentFinding[];
  engagementId: string;
  write: boolean;
  noteProps: (key: string) => { initial?: string; meta?: string };
}) {
  if (findings.length === 0) return <p className="notice notice-good">כל ההעברות תואמות לתלושים: אותו עובד, אותו חודש, אותו סכום ואותו חשבון.</p>;
  const groups = new Map<string, PaymentFinding[]>();
  for (const f of findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);
  const order: PaymentFinding["severity"][] = ["error", "warning", "info"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[1][0].severity) - order.indexOf(b[1][0].severity));
  return (
    <div className="space-y-3">
      <h3 className="font-bold">ממצאים בתשלומים</h3>
      {sorted.map(([kind, items]) => (
        <details key={kind} className="panel card p-0" open={items[0].severity === "error"}>
          <summary className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="flex items-center gap-2">
              <span className={`badge ${SEVERITY[items[0].severity].badge}`}>{SEVERITY[items[0].severity].label}</span>
              <span className="font-bold">{PAYMENT_FINDING_LABELS[kind as PaymentFinding["kind"]]}</span>
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
    </div>
  );
}
