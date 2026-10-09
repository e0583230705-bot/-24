import { formatDate, formatILS } from "@/lib/format";
import type { LedgerAccount, LedgerLine } from "@/lib/domain/ledger/types";
import type { PayrollFile } from "@/lib/domain/payroll/types";
import type { PayslipRow } from "@/lib/domain/payroll/payslips";
import { suggestPayrollAccounts, type PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import {
  compareProvisionsToBooks,
  computeYearEndProvisions,
  PROVISION_FINDING_LABELS,
  provisionFindings,
  type ProvisionFinding,
} from "@/lib/domain/payroll/provisions";
import { recuperationRateAt } from "@/lib/domain/payroll/rates";
import { NoteForm } from "@/components/audit-forms";
import { Icons } from "@/components/icons";
import { saveNoteAction } from "@/app/actions";

const SEVERITY: Record<ProvisionFinding["severity"], { label: string; badge: string }> = {
  error: { label: "שגיאה", badge: "badge-bad" },
  warning: { label: "לבדיקה", badge: "badge-warn" },
  info: { label: "לידיעה", badge: "badge-muted" },
};

const STATUS = {
  ok: { label: "סביר", badge: "badge-good" },
  diff: { label: "פער", badge: "badge-bad" },
  unmapped: { label: "ללא מיפוי", badge: "badge-muted" },
  na: { label: "חסר נתון", badge: "badge-muted" },
} as const;

/** הפרשות סוף שנה (חופשה, הבראה, פיצויים) מחושבות מחדש מהתלושים ומושוות למאזן */
export function ProvisionsSection({
  engagementId,
  fiscalYear,
  rows,
  payroll,
  accounts,
  lines,
  mapping,
  tolerance,
  notes,
  write,
}: {
  engagementId: string;
  fiscalYear: number;
  rows: PayslipRow[];
  payroll: PayrollFile | null;
  accounts: LedgerAccount[];
  lines: LedgerLine[];
  mapping: PayrollAccountMap | null;
  tolerance: number;
  notes: Map<string, { text: string; author: string | null; updatedAt: Date }>;
  write: boolean;
}) {
  const noteProps = (key: string) => {
    const n = notes.get(key);
    return { initial: n?.text, meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined };
  };
  const result = computeYearEndProvisions(rows, fiscalYear, { employees126: payroll?.employees });
  const findings = provisionFindings(result);
  const books =
    accounts.length > 0
      ? compareProvisionsToBooks(result, accounts, lines, mapping ?? suggestPayrollAccounts(accounts), {
          from: `${fiscalYear}-01-01`,
          to: `${fiscalYear}-12-31`,
          tolerance,
        })
      : null;
  const rate = recuperationRateAt(`${fiscalYear}-12-31`);
  const missing = [
    result.missing.vacationBalance && "יתרת חופשה",
    result.missing.recuperationPay && "דמי הבראה",
    result.missing.severance && "פיצויים (הפרשת מעסיק)",
  ].filter(Boolean) as string[];

  const stat = (label: string, value: string, hint?: string) => (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="num text-right text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bubble bg-amber-soft text-amber">
          <Icons.calendar size={20} />
        </span>
        <div>
          <h2 className="card-title">הפרשות סוף שנה</h2>
          <p className="text-xs text-muted">חופשה, הבראה ופיצויים ליום 31.12.{fiscalYear}, מחושבים מחדש מהתלושים ומושווים למאזן.</p>
        </div>
      </div>

      {result.employees.length === 0 ? (
        <p className="notice notice-info">אין בתלושים עובדים פעילים בדצמבר {fiscalYear}, ולכן אין הפרשות לחשב.</p>
      ) : (
        <>
          {missing.length > 0 && (
            <p className="notice notice-warn">
              חסרות בקובץ התלושים העמודות: {missing.join(", ")}. החלקים האלה לא חושבו. אם העמודות קיימות בקובץ, מפו אותן
              ב&quot;מיפוי העמודות&quot; למעלה.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stat("עובדים פעילים ב־31.12", String(result.employees.length), result.excluded ? `${result.excluded} עזבו במהלך השנה` : undefined)}
            {stat("חופשה", result.missing.vacationBalance ? "—" : formatILS(result.totals.vacation), "יתרת ימים × ערך יום")}
            {stat("הבראה שטרם שולמה", result.missing.recuperationPay ? "—" : formatILS(result.totals.recuperation), rate ? `תעריף ${formatILS(rate)} ליום` : undefined)}
            {stat("פיצויים (חלק לא מכוסה)", result.missing.severance ? "—" : formatILS(result.totals.severance), "בהנחת סעיף 14 על ההפקדות")}
          </div>

          {books ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>הפרשה</th>
                    <th className="text-end">מחושב מהתלושים</th>
                    <th className="text-end">יתרה בספרים 31.12</th>
                    <th className="text-end">פער</th>
                    <th>מצב</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((r) => (
                    <tr key={r.group}>
                      <td>
                        <p className="font-medium">{r.label}</p>
                        <p className="num text-xs text-muted">{r.accounts.join(", ") || "לא נבחר חשבון במיפוי חשבונות השכר"}</p>
                        {r.status === "diff" && write && (
                          <div className="mt-2">
                            <NoteForm action={saveNoteAction.bind(null, engagementId, `payroll:prov:${r.group}`)} {...noteProps(`payroll:prov:${r.group}`)} />
                          </div>
                        )}
                      </td>
                      <td className="num text-end">{r.computed === null ? "—" : formatILS(r.computed)}</td>
                      <td className="num text-end">{r.books === null ? "—" : formatILS(r.books)}</td>
                      <td className={`num text-end ${r.status === "diff" ? "font-bold text-danger" : ""}`}>{r.diff === null ? "—" : formatILS(r.diff)}</td>
                      <td>
                        <span className={`badge ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice notice-info">כדי להשוות למאזן, קלטו את ספרי הלקוח (שלב 1 בתיק).</p>
          )}
          <p className="text-xs text-muted">
            פער נחשב מהותי מעל 10% מהסכום המחושב. ההשוואה היא אומדן: עובדים שמשולמת להם הבראה בתאריך אחר, או שההפקדות שלהם
            לפיצויים אינן לפי סעיף 14, יכולים להסביר פער.
          </p>

          {findings.length > 0 && <Findings findings={findings} engagementId={engagementId} write={write} noteProps={noteProps} />}

          <details className="panel table-wrap">
            <summary className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="font-bold">פירוט לפי עובד · {result.employees.length}</span>
              <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
            </summary>
            <table className="table border-t border-border">
              <thead>
                <tr>
                  <th>עובד</th>
                  <th>ותק</th>
                  <th className="text-end">שכר חודשי</th>
                  <th className="text-end">ימי חופשה</th>
                  <th className="text-end">חופשה</th>
                  <th className="text-end">הבראה</th>
                  <th className="text-end">פיצויים</th>
                </tr>
              </thead>
              <tbody>
                {result.employees.slice(0, 500).map((e) => (
                  <tr key={e.taxId}>
                    <td>
                      <p>{e.name || "—"}</p>
                      <p className="num text-xs text-muted">{e.taxId}</p>
                    </td>
                    <td className="num whitespace-nowrap text-xs">
                      {e.seniorityYears === null ? "—" : `${e.seniorityYears.toFixed(1)} שנים`}
                      {e.startDate && <span className="block text-muted">מ־{formatDate(e.startDate)}</span>}
                    </td>
                    <td className="num text-end">{formatILS(e.monthlyBase)}</td>
                    <td className={`num text-end ${e.vacationDays !== null && e.vacationDays < 0 ? "font-bold text-warn" : ""}`}>{e.vacationDays ?? "—"}</td>
                    <td className="num text-end">{e.vacation === null ? "—" : formatILS(e.vacation)}</td>
                    <td className="num text-end">{e.recuperation === null ? "—" : formatILS(e.recuperation)}</td>
                    <td className="num text-end">
                      {e.severance === null ? "—" : formatILS(e.severance)}
                      {e.severanceRate !== null && <span className="block text-xs text-muted">הפקדה {e.severanceRate}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.employees.length > 500 && <p className="p-3 text-xs text-muted">מוצגים 500 מתוך {result.employees.length}.</p>}
          </details>

          <p className="text-xs text-muted">
            ⚠ ימי ההבראה לפי ותק, תעריף ההבראה וערך יום חופשה (שכר חודשי ÷ 21.67, שבוע עבודה של 5 ימים) דורשים אימות של רואה
            חשבון. יתרות קופות הפיצויים (יעודה) אינן בנתונים, ולכן הפיצויים מחושבים כחלק שאינו מכוסה בהפקדות.
          </p>
        </>
      )}
    </section>
  );
}

function Findings({
  findings,
  engagementId,
  write,
  noteProps,
}: {
  findings: ProvisionFinding[];
  engagementId: string;
  write: boolean;
  noteProps: (key: string) => { initial?: string; meta?: string };
}) {
  const groups = new Map<string, ProvisionFinding[]>();
  for (const f of findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);
  const order: ProvisionFinding["severity"][] = ["error", "warning", "info"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[1][0].severity) - order.indexOf(b[1][0].severity));
  return (
    <div className="space-y-3">
      <h3 className="font-bold">ממצאים בהפרשות</h3>
      {sorted.map(([kind, items]) => (
        <details key={kind} className="panel card p-0">
          <summary className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="flex items-center gap-2">
              <span className={`badge ${SEVERITY[items[0].severity].badge}`}>{SEVERITY[items[0].severity].label}</span>
              <span className="font-bold">{PROVISION_FINDING_LABELS[kind as ProvisionFinding["kind"]]}</span>
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
          </ul>
        </details>
      ))}
    </div>
  );
}
