import Link from "next/link";
import type { Workpaper, WorkpaperAreaKey } from "@/lib/services/audit";
import { ReviewButton, WorkpaperForm } from "@/components/workpaper-forms";
import { Icons } from "@/components/icons";
import { prepareWorkpaperAction, reviewWorkpaperAction } from "@/app/actions";

export interface WorkpaperAreaInfo {
  key: WorkpaperAreaKey;
  label: string;
  /** תוצאת הבדיקה האוטומטית (כמו באריח) */
  status: { text: string; tone: "good" | "warn" | "bad" | "muted" };
  findings: { total: number; errors: number; explained: number } | null;
  /** אפשר לבצע את הבדיקה (יש נתונים) */
  available: boolean;
}

/** מה כל בדיקה עושה — לניירות העבודה ולמכתב */
export const AREA_TESTED: Record<WorkpaperAreaKey, string> = {
  tb: "סך החובה מול סך הזכות בספרים, ואיתור פקודות שאינן מאוזנות.",
  je: "פקודות יומן שנרשמו בשבת, בסכום עגול, סמוך לסוף השנה או אחריו, בלי תיאור, מעל המהותיות לביצוע, או כפולות.",
  analytics: "יתרות כל חשבון מול השנה הקודמת (שינוי מעל המהותיות לביצוע ומעל 10%), וחודשים חריגים.",
  recon: "התאמת יתרת הבנק בספרים לדף הבנק ליום המאזן, וסבירות מע״מ עסקאות מול ההכנסות.",
  benford: "התפלגות הספרה הראשונה בסכומי החובה מול חוק בנפורד, לאיתור סכומים מפוברקים.",
  sample: "מדגם כספי (MUS) של פקודות לבדיקה מול אסמכתאות.",
  payroll: "קובץ 126 ודיווחי 102, תלושים מול 126, שכר מול הספרים, הפרשות סוף שנה (חופשה, הבראה, פיצויים), ותשלומים בפועל מול הנטו.",
};

const TONE_BADGE = { good: "badge-good", warn: "badge-warn", bad: "badge-bad", muted: "badge-muted" } as const;
const date = (d: Date) => d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

function suggestion(a: WorkpaperAreaInfo) {
  const parts = [`נבדק: ${AREA_TESTED[a.key]}`];
  if (a.status.text) parts.push(`תוצאה: ${a.status.text}.`);
  if (a.findings && a.findings.total > 0) parts.push(`נמצאו ${a.findings.total} ממצאים${a.findings.explained ? `, מהם ${a.findings.explained} עם הסבר מתועד` : ""}.`);
  parts.push("מסקנה: ");
  return parts.join(" ");
}

export function WorkpapersView({
  engagementId,
  areas,
  workpapers,
  userId,
  write,
}: {
  engagementId: string;
  areas: WorkpaperAreaInfo[];
  workpapers: Map<WorkpaperAreaKey, Workpaper>;
  userId: string;
  write: boolean;
}) {
  const prepared = areas.filter((a) => workpapers.has(a.key)).length;
  const reviewed = areas.filter((a) => workpapers.get(a.key)?.reviewedAt).length;
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bubble bg-violet-soft text-violet">
            <Icons.fileText size={22} />
          </span>
          <div>
            <h2 className="card-title">ניירות עבודה</h2>
            <p className="text-xs text-muted">לכל תחום: מה נבדק, מה נמצא, מסקנה, מי הכין ומי סקר.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="badge badge-brand num">
            {prepared}/{areas.length} הוכנו
          </span>
          <span className={`badge num ${reviewed === areas.length ? "badge-good" : "badge-muted"}`}>
            {reviewed}/{areas.length} נסקרו
          </span>
          <Link href={`/audit/${engagementId}/workpapers`} className="btn-ghost btn-sm">
            הדפסה / PDF
          </Link>
          <a href={`/audit/${engagementId}/export`} download className="btn-ghost btn-sm">
            ממצאים לאקסל
          </a>
          <Link href={`/audit/${engagementId}/letter`} className="btn btn-sm">
            מכתב להנהלה
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {areas.map((a) => {
          const wp = workpapers.get(a.key);
          const canReview = write && wp && !wp.reviewedAt && wp.preparedById !== userId;
          return (
            <section key={a.key} className={`card space-y-3 ${wp?.reviewedAt ? "border-good/40" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/audit/${engagementId}?tab=${a.key}`} className="font-bold hover:underline">
                    {a.label}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">{AREA_TESTED[a.key]}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.status.text && <span className={`badge ${TONE_BADGE[a.status.tone]}`}>{a.status.text}</span>}
                  {a.findings && a.findings.total > 0 && (
                    <span className={`badge ${a.findings.explained === a.findings.total ? "badge-good" : "badge-warn"}`}>
                      {a.findings.explained}/{a.findings.total} ממצאים הוסברו
                    </span>
                  )}
                  {wp?.reviewedAt ? (
                    <span className="badge badge-good">
                      <Icons.check size={12} /> נסקר
                    </span>
                  ) : wp ? (
                    <span className="badge badge-brand">הוכן</span>
                  ) : (
                    <span className="badge badge-muted">טרם הוכן</span>
                  )}
                </div>
              </div>

              {!a.available && !wp ? (
                <p className="text-xs text-muted">אין עדיין נתונים לבדיקה הזו בתיק.</p>
              ) : write ? (
                <WorkpaperForm
                  key={wp?.preparedAt.toISOString() ?? "new"}
                  action={prepareWorkpaperAction.bind(null, engagementId, a.key)}
                  initial={wp?.conclusion}
                  suggestion={suggestion(a)}
                  prepared={Boolean(wp)}
                />
              ) : (
                wp && <p className="whitespace-pre-wrap text-sm">{wp.conclusion}</p>
              )}

              {wp && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted">
                  <span>
                    הוכן: <span className="font-semibold text-text">{wp.preparedBy ?? "—"}</span> · {date(wp.preparedAt)}
                  </span>
                  {wp.reviewedAt ? (
                    <span>
                      נסקר: <span className="font-semibold text-text">{wp.reviewedBy ?? "—"}</span> · {date(wp.reviewedAt)}
                    </span>
                  ) : canReview ? (
                    <ReviewButton action={reviewWorkpaperAction.bind(null, engagementId, a.key)} />
                  ) : (
                    <span>ממתין לסקירה של אדם אחר במשרד</span>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
