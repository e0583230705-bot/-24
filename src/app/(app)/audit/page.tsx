import Link from "next/link";
import { getContext } from "@/lib/auth/dal";
import { listEngagements } from "@/lib/services/audit";
import { CreateEngagementForm } from "@/components/audit-forms";
import { DemoEngagementButton } from "@/components/demo-button";
import { Collapsible } from "@/components/page-header";
import { Icons } from "@/components/icons";
import { todayISO } from "@/lib/format";

export default async function AuditPage() {
  const { org, can, user } = await getContext();
  const engagements = await listEngagements(org.id);
  const year = Number(todayISO().slice(0, 4));
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      {/* כותרת צבעונית */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-brand to-violet p-6 text-white shadow-float md:p-8">
        <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 left-24 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">שלום {firstName}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">תיקי ביקורת</h1>
            <p className="mt-1 text-sm text-white/85">
              {engagements.length === 0 ? "עוד אין תיקים. פותחים אחד למטה." : `${engagements.length} תיקים · ${org.name}`}
            </p>
          </div>
          {can("write_books") && engagements.length > 0 && (
            <a href="#new" className="btn bg-white text-brand hover:bg-white/90">
              <Icons.plus size={16} />
              תיק חדש
            </a>
          )}
        </div>
      </section>

      {engagements.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {engagements.map(({ engagement: e, lineCount }) => {
            const hasBooks = lineCount > 0;
            const hasMateriality = Boolean(e.materialityBase && e.materialityPct);
            const hasPrior = Boolean(e.priorSource);
            const done = [hasBooks, hasMateriality, hasPrior].filter(Boolean).length;
            return (
              <Link key={e.id} href={`/audit/${e.id}`} className="tile flex-col items-stretch gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="bubble bg-violet-soft text-violet">
                    <Icons.audit size={22} />
                  </span>
                  <span className="badge badge-muted num">{e.fiscalYear}</span>
                </div>
                <div>
                  <p className="text-lg font-bold leading-tight">{e.clientName}</p>
                  {e.clientTaxId && <p className="num text-xs text-muted">ח.פ. {e.clientTaxId}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`badge ${hasBooks ? "badge-good" : "badge-muted"}`}>
                    {hasBooks ? <Icons.check size={12} /> : null}
                    {hasBooks ? `${lineCount.toLocaleString("he-IL")} שורות` : "אין ספרים"}
                  </span>
                  <span className={`badge ${hasMateriality ? "badge-good" : "badge-muted"}`}>
                    {hasMateriality ? <Icons.check size={12} /> : null}
                    מהותיות
                  </span>
                  <span className={`badge ${hasPrior ? "badge-good" : "badge-muted"}`}>
                    {hasPrior ? <Icons.check size={12} /> : null}
                    שנה קודמת
                  </span>
                </div>
                <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gradient-to-l from-brand to-violet" style={{ width: `${(done / 3) * 100}%` }} />
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {can("write_books") && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bubble bg-amber-soft text-amber">
              <Icons.sparkles size={20} />
            </span>
            <div>
              <p className="font-bold">רוצים לראות את הבדיקות בפעולה?</p>
              <p className="text-xs text-muted">תיק עם נתונים מדומים: ספרים, תלושים והעברות, עם בעיות שנשתלו בכוונה.</p>
            </div>
          </div>
          <DemoEngagementButton className="btn" />
        </div>
      )}

      {can("write_books") && (
        <div id="new">
          <Collapsible title="תיק ביקורת חדש" description="שם הלקוח, ח.פ. ושנת הדוח" open={engagements.length === 0}>
            <CreateEngagementForm defaultYear={year - 1} />
          </Collapsible>
        </div>
      )}

      <p className="text-center text-xs text-muted">
        המערכת מבצעת את הבדיקות ומכינה את החומר. שיקול הדעת וחוות הדעת נשארים אצל רואה החשבון המבקר.
      </p>
    </div>
  );
}
