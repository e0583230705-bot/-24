import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { loadEngagementOverview } from "../overview";
import { buildManagementLetter } from "@/lib/domain/audit/management-letter";
import { PrintButton } from "@/components/print-button";
import { Icons } from "@/components/icons";

export default async function ManagementLetterPage({ params }: PageProps<"/audit/[id]/letter">) {
  const { id } = await params;
  const { org } = await getContext();
  const ov = await loadEngagementOverview(org.id, id);
  if (!ov) notFound();
  const { engagement: e, findings } = ov;
  const topics = buildManagementLetter(findings);
  const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/audit/${e.id}`} className="link inline-flex items-center gap-1 text-sm">
          <Icons.arrowForward size={14} /> חזרה לתיק
        </Link>
        <PrintButton />
      </div>
      <p className="notice notice-warn print:hidden">
        טיוטה שהופקה אוטומטית מהממצאים בתיק. יש לקרוא, לערוך ולהחליט מה נכלל לפני משלוח — האחריות לנוסח היא של רואה החשבון.
        ממצאים ברמת &quot;לידיעה&quot; לא נכללים.
      </p>

      <article className="card space-y-6 text-[15px] leading-relaxed print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="font-bold">{org.name}</p>
            <p className="text-sm text-muted">{today}</p>
          </div>
          <div>
            <p>לכבוד</p>
            <p className="font-semibold">הנהלת {e.clientName}</p>
          </div>
          <p className="font-bold">
            הנדון: הערות בעקבות ביקורת הדוחות הכספיים לשנת <span className="num">{e.fiscalYear}</span>
          </p>
        </header>

        <p>
          במהלך ביקורת הדוחות הכספיים של החברה לשנה שהסתיימה ביום 31 בדצמבר {e.fiscalYear} עלו נושאים הנוגעים לתהליכים
          ולבקרות הפנימיות, שאנו מביאים לידיעתכם יחד עם המלצותינו. הביקורת לא תוכננה לאתר את כל הליקויים בבקרה הפנימית,
          ולכן ייתכנו נושאים נוספים שלא עלו במסגרתה.
        </p>

        {topics.length === 0 ? (
          <p className="notice notice-good print:hidden">לא נמצאו בתיק ממצאים שמצדיקים הערה להנהלה. אם עדיין לא נקלטו כל הקבצים, ייתכן שזו התמונה החלקית.</p>
        ) : (
          <ol className="space-y-6">
            {topics.map((t, i) => (
              <li key={t.id} className="space-y-2 break-inside-avoid">
                <h2 className="text-base font-bold">
                  {i + 1}. {t.title}
                </h2>
                <p>
                  <span className="font-semibold">ממצא: </span>
                  {t.total === 1 ? "נמצא מקרה אחד" : `נמצאו ${t.total} מקרים`} — {t.kinds.map((k) => (t.kinds.length === 1 && k.count === 1 ? k.label : `${k.label} (${k.count})`)).join("; ")}.
                </p>
                {t.examples.length > 0 && (
                  <ul className="list-disc space-y-1 ps-6 text-sm text-muted print:text-black">
                    {t.examples.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
                {t.risk && (
                  <p>
                    <span className="font-semibold">הסיכון: </span>
                    {t.risk}
                  </p>
                )}
                <p>
                  <span className="font-semibold">המלצה: </span>
                  {t.recommendation}
                </p>
                <p className="text-sm text-muted print:text-black">
                  <span className="font-semibold">תגובת ההנהלה: </span>
                  ____________________________________________
                </p>
              </li>
            ))}
          </ol>
        )}

        <footer className="space-y-1 pt-4">
          <p>נשמח לעמוד לרשותכם לכל שאלה ולסייע ביישום ההמלצות.</p>
          <p className="pt-6 font-semibold">בכבוד רב,</p>
          <p>{org.name}</p>
          <p className="text-sm text-muted">רואי חשבון</p>
        </footer>
      </article>
    </div>
  );
}
