import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { formatILS } from "@/lib/format";
import { MATERIALITY_BASES, type MaterialityBasis } from "@/lib/domain/ledger/materiality";
import { PrintButton } from "@/components/print-button";
import { Icons } from "@/components/icons";
import { AREA_LABELS, loadEngagementOverview } from "../overview";
import { AREA_TESTED } from "../workpapers-view";

const SEVERITY = { error: "שגיאה", warning: "לבדיקה", info: "לידיעה" } as const;
const date = (d: Date) => d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
const MAX_APPENDIX = 600;

/** ניירות העבודה של התיק כמסמך אחד להדפסה / שמירה כ־PDF */
export default async function WorkpapersPrintPage({ params }: PageProps<"/audit/[id]/workpapers">) {
  const { id } = await params;
  const { org } = await getContext();
  const ov = await loadEngagementOverview(org.id, id);
  if (!ov) notFound();
  const { engagement: e, materiality, workpapers, areas, findings, notes, payroll, payslips, payments } = ov;
  const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" });
  const prepared = areas.filter((a) => workpapers.has(a.key)).length;
  const reviewed = areas.filter((a) => workpapers.get(a.key)?.reviewedAt).length;
  const sources = [
    e.sourceFilename && `ספרים: ${e.sourceFilename}`,
    payroll?.filename && `קובץ 126: ${payroll.filename}`,
    payslips?.filename && `ריכוז שכר: ${payslips.filename}`,
    payments?.filename && `פירוט העברות: ${payments.filename}`,
  ].filter(Boolean) as string[];
  const appendix = [...findings].sort((a, b) => a.area.localeCompare(b.area));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/audit/${e.id}?tab=wp`} className="link inline-flex items-center gap-1 text-sm">
          <Icons.arrowForward size={14} /> חזרה לניירות העבודה
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/audit/${e.id}/export`} download className="btn-ghost btn-sm">
            ממצאים לאקסל
          </a>
          <PrintButton />
        </div>
      </div>

      <article className="card space-y-6 text-sm leading-relaxed print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-2 border-b border-border pb-4">
          <div className="flex items-start justify-between gap-4">
            <p className="font-bold">{org.name}</p>
            <p className="text-muted">הופק {today}</p>
          </div>
          <h1 className="text-xl font-black">
            ניירות עבודה · {e.clientName} · <span className="num">{e.fiscalYear}</span>
          </h1>
          <p className="text-muted">
            {e.clientTaxId && <>ח.פ. {e.clientTaxId} · </>}
            {prepared}/{areas.length} תחומים הוכנו · {reviewed} נסקרו · {findings.length} ממצאים
          </p>
          {materiality && (
            <p>
              <span className="font-semibold">מהותיות: </span>
              כוללת {formatILS(materiality.overall)} · לביצוע {formatILS(materiality.performance)} · זניחה {formatILS(materiality.trivial)} (
              {MATERIALITY_BASES[e.materialityBasis as MaterialityBasis]?.label}, {e.materialityPct}%)
            </p>
          )}
          {sources.length > 0 && (
            <p>
              <span className="font-semibold">קבצים שנקלטו: </span>
              {sources.join(" · ")}
            </p>
          )}
        </header>

        <section className="space-y-5">
          {areas.map((a, i) => {
            const wp = workpapers.get(a.key);
            return (
              <div key={a.key} className="space-y-1.5 break-inside-avoid">
                <h2 className="text-base font-bold">
                  {i + 1}. {a.label}
                </h2>
                <p>
                  <span className="font-semibold">מה נבדק: </span>
                  {AREA_TESTED[a.key]}
                </p>
                <p>
                  <span className="font-semibold">תוצאה: </span>
                  {a.available ? a.status.text || "—" : "אין נתונים בתיק"}
                  {a.findings && a.findings.total > 0 && ` · ${a.findings.total} ממצאים, ${a.findings.explained} הוסברו`}
                </p>
                <p className="whitespace-pre-wrap">
                  <span className="font-semibold">מסקנה: </span>
                  {wp?.conclusion ?? "טרם נכתבה"}
                </p>
                <p className="text-muted print:text-black">
                  הוכן: {wp ? `${wp.preparedBy ?? "—"} · ${date(wp.preparedAt)}` : "—"} &nbsp;|&nbsp; נסקר:{" "}
                  {wp?.reviewedAt ? `${wp.reviewedBy ?? "—"} · ${date(wp.reviewedAt)}` : "—"}
                </p>
              </div>
            );
          })}
        </section>

        {appendix.length > 0 && (
          <section className="space-y-2 break-before-page">
            <h2 className="text-base font-bold">נספח: ממצאים והסברים</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="py-1 text-start">תחום</th>
                  <th className="py-1 text-start">חומרה</th>
                  <th className="py-1 text-start">ממצא</th>
                  <th className="py-1 text-start">הסבר בתיק</th>
                </tr>
              </thead>
              <tbody>
                {appendix.slice(0, MAX_APPENDIX).map((f) => {
                  const n = notes.get(f.key);
                  return (
                    <tr key={f.key} className="break-inside-avoid border-b border-border/60 align-top">
                      <td className="py-1 pe-2 whitespace-nowrap">{AREA_LABELS[f.area]}</td>
                      <td className="py-1 pe-2 whitespace-nowrap">{SEVERITY[f.severity]}</td>
                      <td className="py-1 pe-2">{f.message}</td>
                      <td className="py-1">{n ? `${n.text} (${n.author ?? ""}, ${date(n.updatedAt)})` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {appendix.length > MAX_APPENDIX && (
              <p className="text-muted">מוצגים {MAX_APPENDIX} מתוך {appendix.length} ממצאים. הרשימה המלאה בייצוא לאקסל.</p>
            )}
          </section>
        )}
      </article>
    </div>
  );
}
