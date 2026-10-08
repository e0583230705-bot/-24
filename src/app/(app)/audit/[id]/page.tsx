import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth/dal";
import { loadEngagementLedger } from "@/lib/services/audit";
import { trialBalance, unbalancedEntries } from "@/lib/domain/ledger/trial-balance";
import { FLAG_LABELS, testJournalEntries, type JournalFlag } from "@/lib/domain/ledger/journal-tests";
import { benford, BENFORD_MIN_SAMPLE, CONFORMITY_LABELS } from "@/lib/domain/ledger/benford";
import { computeMateriality, MATERIALITY_BASES, type MaterialityBasis } from "@/lib/domain/ledger/materiality";
import { monetaryUnitSample } from "@/lib/domain/ledger/sampling";
import { formatDate, formatILS } from "@/lib/format";
import {
  BankStatementForm,
  LedgerImportForm,
  MaterialityForm,
  NoteForm,
  StatementBalanceForm,
  VatConfigForm,
} from "@/components/audit-forms";
import {
  importBankStatementAction,
  importLedgerAction,
  redrawSampleAction,
  saveNoteAction,
  setMaterialityAction,
  setStatementBalanceAction,
  setVatConfigAction,
} from "@/app/actions";
import { reconcileBank, statementBalanceAt } from "@/lib/domain/ledger/bank-reconciliation";
import { suggestVatAccounts, vatReasonableness } from "@/lib/domain/ledger/vat-reconciliation";
import { listBankStatements, type VatConfig } from "@/lib/services/audit";
import { compareYears, monthlySpikes } from "@/lib/domain/ledger/analytics";
import { listNotes, listWorkpapers, loadPayments, loadPayroll, loadPayslips, WORKPAPER_AREAS } from "@/lib/services/audit";
import { collectFindings, findingsByArea } from "@/lib/domain/audit/findings";
import { WorkpapersView, type WorkpaperAreaInfo } from "./workpapers-view";
import { PayrollTab, payrollStatus } from "./payroll-tab";
import type { PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import { PageHeader } from "@/components/page-header";
import { Icons } from "@/components/icons";

const TABS = [
  { key: "tb", label: "מאזן בוחן", icon: "chart", tone: "bg-sky-soft text-sky", blurb: "האם סך החובה שווה לסך הזכות" },
  { key: "je", label: "פקודות חריגות", icon: "alert", tone: "bg-orange-soft text-orange", blurb: "סכומים עגולים, שבת, סוף שנה, מעל המהותיות" },
  { key: "analytics", label: "סקירה אנליטית", icon: "sparkles", tone: "bg-violet-soft text-violet", blurb: "שינויים מול שנה קודמת וחודשים חריגים" },
  { key: "recon", label: "התאמות", icon: "bank", tone: "bg-teal-soft text-teal", blurb: "בנק ליום המאזן וסבירות מע״מ" },
  { key: "benford", label: "חוק בנפורד", icon: "percent", tone: "bg-pink-soft text-pink", blurb: "התפלגות הספרה הראשונה" },
  { key: "sample", label: "מדגם", icon: "inbox", tone: "bg-amber-soft text-amber", blurb: "פקודות לבדיקה מול אסמכתאות" },
  { key: "payroll", label: "שכר", icon: "users", tone: "bg-brand-soft text-brand", blurb: "126, תלושים, הפרשות ותשלומים מול הספרים" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function EngagementPage({ params, searchParams }: PageProps<"/audit/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { org, can, user } = await getContext();
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await loadEngagementLedger(org.id, id) : null;
  if (!data) notFound();
  const { engagement: e, accounts, lines } = data;
  const tab: TabKey | null = TABS.find((t) => t.key === sp.tab)?.key ?? null;
  const showWorkpapers = sp.tab === "wp";
  const write = can("write_books");
  const hasBooks = lines.length > 0;

  const materiality =
    e.materialityBase && e.materialityPct ? computeMateriality(e.materialityBase, e.materialityPct) : null;
  const [notes, statements, payroll, payslips, payments] = await Promise.all([
    listNotes(org.id, e.id),
    listBankStatements(org.id, e.id),
    loadPayroll(org.id, e.id),
    loadPayslips(org.id, e.id),
    loadPayments(org.id, e.id),
  ]);
  const workpapers = await listWorkpapers(org.id, e.id);

  // שורת סטטוס קצרה לכל בדיקה, לאריחים בסקירה
  const status: Record<TabKey, { text: string; tone: "good" | "warn" | "bad" | "muted" }> = {
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
      status.analytics = rows.length === 0 ? { text: "אין שינויים מהותיים", tone: "good" } : { text: `${explained}/${rows.length} הוסברו`, tone: explained === rows.length ? "good" : "warn" };
    }
    status.recon = statements.length === 0 ? { text: "אין דפי בנק", tone: "muted" } : { text: `${statements.length} חשבונות בנק`, tone: "good" };
    status.sample = materiality ? { text: "מוכן לדגימה", tone: "good" } : { text: "צריך מהותיות", tone: "muted" };
  }
  const TONE_BADGE = { good: "badge-good", warn: "badge-warn", bad: "badge-bad", muted: "badge-muted" } as const;

  // ממצאים מכל הבדיקות — לניירות העבודה (אותם חישובים כמו במסכים)
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
    label: TABS.find((t) => t.key === key)!.label,
    status: status[key],
    findings: byArea.get(key) ?? null,
    available: key === "payroll" ? hasPayroll : hasBooks,
  }));
  const wpPrepared = areas.filter((a) => workpapers.has(a.key)).length;
  const wpReviewed = areas.filter((a) => workpapers.get(a.key)?.reviewedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/audit", label: "כל התיקים" }}
        title={
          <>
            {e.clientName} <span className="text-muted">· <span className="num">{e.fiscalYear}</span></span>
          </>
        }
        description={
          <span className="flex flex-wrap gap-1.5">
            {e.clientTaxId && <span className="badge badge-muted num">ח.פ. {e.clientTaxId}</span>}
            {hasBooks ? (
              <span className="badge badge-good">
                <Icons.check size={12} /> {lines.length.toLocaleString("he-IL")} שורות · {e.sourceType === "uniform" ? "מבנה אחיד" : "כרטסת"}
              </span>
            ) : (
              <span className="badge badge-warn">עוד לא נקלטו ספרים</span>
            )}
            {materiality && (
              <span className="badge badge-good">
                <Icons.check size={12} /> מהותיות {formatILS(materiality.overall)}
              </span>
            )}
          </span>
        }
        actions={
          (tab || showWorkpapers) && (
            <Link href={`/audit/${e.id}`} className="btn-ghost btn-sm">
              לסקירת התיק
            </Link>
          )
        }
      />

      {showWorkpapers && <WorkpapersView engagementId={e.id} areas={areas} workpapers={workpapers} userId={user.id} write={write} />}

      {tab === null && !showWorkpapers && (
        <>
          {/* שלב 1+2: ספרים ומהותיות */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`card space-y-3 ${hasBooks ? "" : "border-brand/40 bg-brand-soft/30"}`}>
              <div className="flex items-center gap-3">
                <span className="bubble bg-brand-soft text-brand font-black">1</span>
                <div className="flex-1">
                  <h2 className="card-title">ספרי הלקוח</h2>
                  <p className="text-xs text-muted">{hasBooks ? "נקלטו. אפשר לקלוט שוב וזה יחליף." : "קובץ במבנה אחיד או כרטסת CSV"}</p>
                </div>
                {hasBooks && <Icons.check size={20} className="text-good" />}
              </div>
              <SourcePanel engagement={e} />
              {write && (
                <details className="panel" open={!hasBooks}>
                  <summary className="link text-sm">{hasBooks ? "קליטה מחדש" : "איך קולטים?"}</summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs leading-relaxed text-muted">
                      <strong>התוכנה שבה הלקוח מנהל את הספרים</strong> (חשבשבת, פריוריטי, רווחית וכו&apos;) מפיקה &quot;קובץ במבנה
                      אחיד&quot; (תיקיית OPENFRMT). בוחרים כאן יחד את BKMVDATA.TXT ו־INI.TXT. אפשר גם כרטסת CSV.
                    </p>
                    <LedgerImportForm action={importLedgerAction.bind(null, e.id, "current")} label={`קליטת שנת ${e.fiscalYear}`} />
                  </div>
                </details>
              )}
            </div>
            <div className={`card space-y-3 ${materiality || !hasBooks ? "" : "border-brand/40 bg-brand-soft/30"}`}>
              <div className="flex items-center gap-3">
                <span className="bubble bg-brand-soft text-brand font-black">2</span>
                <div className="flex-1">
                  <h2 className="card-title">מהותיות</h2>
                  <p className="text-xs text-muted">קובעת מה נחשב &quot;גדול&quot; בבדיקות</p>
                </div>
                {materiality && <Icons.check size={20} className="text-good" />}
              </div>
              {materiality && (
                <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">כוללת</dt>
                    <dd className="num font-bold">{formatILS(materiality.overall)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">לביצוע</dt>
                    <dd className="num font-bold">{formatILS(materiality.performance)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">זניחה</dt>
                    <dd className="num font-bold">{formatILS(materiality.trivial)}</dd>
                  </div>
                  <dd className="col-span-3 text-xs text-muted">
                    {MATERIALITY_BASES[e.materialityBasis as MaterialityBasis]?.label} · {e.materialityPct}%
                  </dd>
                </dl>
              )}
              {write && (
                <details className="panel" open={!materiality}>
                  <summary className="link text-sm">{materiality ? "שינוי" : "הגדרה"}</summary>
                  <div className="mt-3">
                    <MaterialityForm
                      action={setMaterialityAction.bind(null, e.id)}
                      initial={{ basis: e.materialityBasis, base: e.materialityBase, pct: e.materialityPct }}
                    />
                  </div>
                </details>
              )}
            </div>
          </div>

          {/* שלב 3: הבדיקות */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="bubble bg-brand-soft text-brand font-black">3</span>
              <h2 className="card-title">הבדיקות</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {TABS.map((t) => {
                const Icon = Icons[t.icon];
                const st = status[t.key];
                return (
                  <Link
                    key={t.key}
                    href={hasBooks || t.key === "payroll" ? `/audit/${e.id}?tab=${t.key}` : `/audit/${e.id}`}
                    aria-disabled={!hasBooks && t.key !== "payroll"}
                    className={`tile ${hasBooks || t.key === "payroll" ? "" : "pointer-events-none opacity-50"}`}
                  >
                    <span className={`bubble ${t.tone}`}>
                      <Icon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold">{t.label}</span>
                        {st.text && <span className={`badge ${TONE_BADGE[st.tone]}`}>{st.text}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* שלב 4: סיכום — ניירות עבודה ומכתב להנהלה */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="bubble bg-brand-soft text-brand font-black">4</span>
              <h2 className="card-title">סיכום התיק</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link href={`/audit/${e.id}?tab=wp`} className="tile">
                <span className="bubble bg-violet-soft text-violet">
                  <Icons.fileText size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold">ניירות עבודה</span>
                    <span className={`badge num ${wpReviewed === areas.length ? "badge-good" : wpPrepared ? "badge-brand" : "badge-muted"}`}>
                      {wpPrepared}/{areas.length} הוכנו · {wpReviewed} נסקרו
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">מסקנה לכל תחום, מי הכין ומי סקר</span>
                </span>
              </Link>
              <Link href={`/audit/${e.id}/letter`} className="tile">
                <span className="bubble bg-pink-soft text-pink">
                  <Icons.inbox size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold">מכתב להנהלה</span>
                    <span className={`badge num ${findings.length ? "badge-warn" : "badge-muted"}`}>{findings.length} ממצאים</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">טיוטה מכל הממצאים בתיק, להדפסה ועריכה</span>
                </span>
              </Link>
            </div>
          </section>
        </>
      )}

      {tab !== null && (hasBooks || tab === "payroll") && (
        <>
          <nav className="pills w-fit max-w-full overflow-x-auto" aria-label="חלקי התיק">
            {TABS.map((t) => (
              <Link key={t.key} href={`/audit/${e.id}?tab=${t.key}`} className={`pill ${t.key === tab ? "pill-active" : ""}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          {tab === "tb" && <TrialBalanceTab accounts={accounts} lines={lines} />}
          {tab === "analytics" && (
            <AnalyticsTab
              data={data}
              performance={materiality?.performance ?? null}
              by={sp.by === "group" ? "group" : "account"}
              write={write}
              notes={notes}
            />
          )}
          {tab === "recon" && (
            <ReconTab data={data} statements={statements} notes={notes} tolerance={materiality?.trivial ?? 1000_00} write={write} />
          )}
          {tab === "je" && (
            <JournalTab lines={lines} yearEnd={e.yearEnd} performance={materiality?.performance ?? Number.MAX_SAFE_INTEGER} />
          )}
          {tab === "benford" && <BenfordTab lines={lines} />}
          {tab === "payroll" && (
            <PayrollTab
              engagementId={e.id}
              fiscalYear={e.fiscalYear}
              payroll={payroll?.file ?? null}
              filename={payroll?.filename ?? null}
              payslips={payslips}
              payments={payments}
              accounts={accounts}
              lines={lines}
              mapping={(e.payrollConfig as PayrollAccountMap | null) ?? null}
              tolerance={materiality?.trivial ?? 1000_00}
              notes={notes}
              write={write}
            />
          )}
          {tab === "sample" && (
            <SampleTab
              lines={lines}
              seed={e.sampleSeed}
              size={Math.min(200, Math.max(1, Number(sp.n) || 25))}
              engagementId={e.id}
              canRedraw={write}
            />
          )}
        </>
      )}
    </div>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof loadEngagementLedger>>>;

function TrialBalanceTab({ accounts, lines }: Pick<Data, "accounts" | "lines">) {
  const tb = trialBalance(accounts, lines);
  const unbalanced = unbalancedEntries(lines);
  return (
    <div className="space-y-3">
      {tb.balanced && unbalanced.length === 0 ? (
        <p className="notice notice-info">המאזן מאוזן: סך החובה שווה לסך הזכות בכל הפקודות.</p>
      ) : (
        <div className="notice notice-bad">
          <p className="font-bold">המאזן אינו מאוזן — {unbalanced.length} פקודות שהחובה והזכות בהן לא שווים</p>
          <ul className="mt-1 list-inside list-disc">
            {unbalanced.slice(0, 20).map((u) => (
              <li key={u.entryId}>
                פקודה <span className="num">{u.entryId}</span> · הפרש <span className="num">{formatILS(u.difference)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>חשבון</th>
              <th>שם</th>
              <th className="text-end">חובה</th>
              <th className="text-end">זכות</th>
              <th className="text-end">יתרה</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.code}>
                <td className="num">{r.code}</td>
                <td>{r.name}</td>
                <td className="num text-end">{formatILS(r.debits)}</td>
                <td className="num text-end">{formatILS(r.credits)}</td>
                <td className="num text-end font-medium">
                  {formatILS(Math.abs(r.closing))} {r.closing > 0 ? "ח" : r.closing < 0 ? "ז" : ""}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={2}>סה״כ</td>
              <td className="num text-end">{formatILS(tb.totals.debits)}</td>
              <td className="num text-end">{formatILS(tb.totals.credits)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JournalTab({ lines, yearEnd, performance }: { lines: Data["lines"]; yearEnd: string; performance: number }) {
  const flagged = testJournalEntries(lines, { yearEnd, performanceMateriality: performance });
  const counts = new Map<JournalFlag, number>();
  for (const f of flagged) for (const flag of f.flags) counts.set(flag, (counts.get(flag) ?? 0) + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {[...counts.entries()].map(([flag, n]) => (
          <span key={flag} className="badge badge-warn">
            {FLAG_LABELS[flag]}: <span className="num">{n}</span>
          </span>
        ))}
        {flagged.length === 0 && <span className="text-muted">לא נמצאו פקודות חריגות.</span>}
      </div>
      {performance === Number.MAX_SAFE_INTEGER && (
        <p className="text-xs text-muted">בדיקת &quot;סכום גבוה מהמהותיות&quot; תופעל אחרי הגדרת מהותיות.</p>
      )}
      {flagged.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>פקודה</th>
                <th>תאריך</th>
                <th>תיאור</th>
                <th className="text-end">סכום</th>
                <th>סיבות לבדיקה</th>
              </tr>
            </thead>
            <tbody>
              {flagged.slice(0, 300).map((f) => (
                <tr key={f.entryId}>
                  <td className="num">{f.entryId}</td>
                  <td className="num whitespace-nowrap">{formatDate(f.date)}</td>
                  <td>{f.description || <span className="text-muted">—</span>}</td>
                  <td className="num text-end">{formatILS(f.total)}</td>
                  <td className="text-xs">{f.flags.map((x) => FLAG_LABELS[x]).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {flagged.length > 300 && <p className="p-3 text-xs text-muted">מוצגות 300 הפקודות בעלות הסיכון הגבוה ביותר מתוך {flagged.length}.</p>}
        </div>
      )}
    </div>
  );
}

function BenfordTab({ lines }: { lines: Data["lines"] }) {
  const r = benford(lines.filter((l) => l.amount > 0).map((l) => l.amount));
  const max = Math.max(...r.observed, ...r.expected);
  return (
    <div className="card space-y-3">
      <p className="text-sm">
        נבדקו <span className="num">{r.n.toLocaleString("he-IL")}</span> סכומי חובה מעל 10 ₪ · סטייה ממוצעת (MAD){" "}
        <span className="num">{r.mad.toFixed(4)}</span> ·{" "}
        <strong className={r.conformity === "nonconformity" ? "text-danger" : r.conformity === "marginal" ? "text-warn" : "text-brand"}>
          {CONFORMITY_LABELS[r.conformity]}
        </strong>
      </p>
      {!r.reliable && (
        <p className="text-xs text-warn">פחות מ־{BENFORD_MIN_SAMPLE} סכומים — לתוצאה אין משמעות סטטיסטית.</p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>ספרה ראשונה</th>
            <th className="text-end">צפוי</th>
            <th className="text-end">בפועל</th>
            <th className="w-1/2" aria-label="השוואה" />
          </tr>
        </thead>
        <tbody>
          {r.expected.map((exp, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td className="num text-end">{(exp * 100).toFixed(1)}%</td>
              <td className="num text-end">{(r.observed[i] * 100).toFixed(1)}%</td>
              <td>
                <div className="space-y-0.5">
                  <div className="h-1.5 rounded bg-muted/50" style={{ width: `${(exp / max) * 100}%` }} />
                  <div className="h-1.5 rounded bg-brand" style={{ width: `${(r.observed[i] / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded bg-muted/50" /> צפוי לפי בנפורד
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded bg-brand" /> בפועל
        </span>
      </p>
    </div>
  );
}

function SampleTab({
  lines,
  seed,
  size,
  engagementId,
  canRedraw,
}: {
  lines: Data["lines"];
  seed: number;
  size: number;
  engagementId: string;
  canRedraw: boolean;
}) {
  // האוכלוסייה: פקודות, לפי סך צד החובה של כל פקודה
  const entries = new Map<string, { id: string; amount: number; date: string; description: string }>();
  for (const l of lines) {
    const e = entries.get(l.entryId) ?? { id: l.entryId, amount: 0, date: l.date, description: l.description };
    if (l.amount > 0) e.amount += l.amount;
    if (!e.description && l.description) e.description = l.description;
    entries.set(l.entryId, e);
  }
  const population = [...entries.values()];
  const sample = monetaryUnitSample(population, size, seed);
  const byId = new Map(population.map((p) => [p.id, p]));
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3 text-sm">
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="sample" />
          <label htmlFor="n">גודל מדגם</label>
          <input id="n" name="n" type="number" min={1} max={200} defaultValue={size} className="input num w-24" />
          <button className="btn-ghost">עדכון</button>
        </form>
        <span className="text-muted">
          אוכלוסייה <span className="num">{population.length.toLocaleString("he-IL")}</span> פקודות · מרווח{" "}
          <span className="num">{formatILS(sample.interval)}</span> · seed <span className="num">{seed}</span>
        </span>
        {canRedraw && (
          <form action={redrawSampleAction.bind(null, engagementId)}>
            <button className="text-xs text-muted hover:text-text">דגימה מחדש</button>
          </form>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>פקודה</th>
              <th>תאריך</th>
              <th>תיאור</th>
              <th className="text-end">סכום</th>
              <th>סוג בחירה</th>
            </tr>
          </thead>
          <tbody>
            {sample.selected.map((s) => {
              const e = byId.get(s.id)!;
              return (
                <tr key={s.id}>
                  <td className="num">{s.id}</td>
                  <td className="num">{formatDate(e.date)}</td>
                  <td>{e.description || <span className="text-muted">—</span>}</td>
                  <td className="num text-end">{formatILS(s.amount)}</td>
                  <td className="text-xs">{s.reason === "key" ? "פריט מפתח (גדול מהמרווח)" : "נדגם"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        המדגם נקבע לפי ה־seed ולכן ניתן לשחזור מלא בתיק הביקורת. כל דגימה מחדש נרשמת ביומן הפעולות.
      </p>
    </div>
  );
}

interface SourceMeta {
  businessTaxId: string;
  businessName: string | null;
  softwareName: string | null;
  softwareRegistration: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
}

function SourcePanel({ engagement: e }: { engagement: Data["engagement"] }) {
  if (!e.importedAt) return null;
  const meta = e.sourceMeta as SourceMeta | null;
  const issues = (e.importIssues as { severity: "error" | "warning"; message: string }[] | null) ?? [];
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-2xl bg-surface-2 p-3 text-sm">
      <div className="min-w-0 space-y-1">
      {e.sourceType === "uniform" && meta ? (
        <p className="text-muted">
          קובץ במבנה אחיד
          {meta.softwareName && <> · תוכנה: {meta.softwareName}</>}
          {meta.softwareRegistration && (
            <>
              {" "}
              (רישום <span className="num">{meta.softwareRegistration}</span>)
            </>
          )}
          {meta.businessName && <> · {meta.businessName}</>} · עוסק <span className="num">{meta.businessTaxId}</span>
          {meta.rangeFrom && meta.rangeTo && (
            <>
              {" "}
              · תקופה <span className="num">{formatDate(meta.rangeFrom)}</span>–<span className="num">{formatDate(meta.rangeTo)}</span>
            </>
          )}
        </p>
      ) : (
        <p className="text-muted">כרטסת הנהלת חשבונות (CSV)</p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 pt-1">
          {issues.map((i) => (
            <li key={i.message} className={i.severity === "error" ? "text-danger" : "text-warn"}>
              {i.severity === "error" ? "✕" : "⚠"} {i.message}
            </li>
          ))}
        </ul>
      )}
      </div>
      {issues.length === 0 ? (
        <span className="badge badge-good">{e.sourceType === "uniform" ? "בדיקות השלמות עברו" : "נקלט"}</span>
      ) : issues.some((i) => i.severity === "error") ? (
        <span className="badge badge-bad">{issues.length} ממצאים בקובץ</span>
      ) : (
        <span className="badge badge-warn">{issues.length} אזהרות</span>
      )}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const FLAG_TEXT = { significant: "שינוי מהותי", new: "חשבון חדש", removed: "חשבון שנסגר" } as const;

function AnalyticsTab({
  data,
  performance,
  by,
  write,
  notes,
}: {
  data: Data;
  performance: number | null;
  by: "account" | "group";
  write: boolean;
  notes: Awaited<ReturnType<typeof listNotes>>;
}) {
  const e = data.engagement;
  const prior = e.priorSource as { filename: string; type: string; importedAt: string; issues: { message: string }[] } | null;
  const hasGroups = data.accounts.some((a) => a.trialBalanceCode);
  const noteFor = (key: string) => {
    const n = notes.get(key);
    return {
      initial: n?.text,
      meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined,
    };
  };

  if (performance === null) {
    return <p className="card text-sm text-muted">הגדירו מהותיות כדי להריץ את הסקירה האנליטית — היא קובעת אילו שינויים מסומנים.</p>;
  }

  const rows = data.prior.lines.length > 0 ? compareYears(data, data.prior, { performanceMateriality: performance, by }) : [];
  const flagged = rows.filter((r) => r.flag);
  const spikes = monthlySpikes(data.accounts, data.lines, performance);
  const explained = flagged.filter((r) => notes.has(`analytics:${r.key}`)).length;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2 className="card-title">נתוני השנה הקודמת ({e.fiscalYear - 1})</h2>
        {prior ? (
          <p className="text-sm text-muted">
            נקלט מ־<span className="num">{prior.filename}</span> · {data.prior.lines.length.toLocaleString("he-IL")} שורות
            {prior.issues?.length ? ` · ${prior.issues.length} בעיות בקובץ` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted">כדי להשוות לשנה קודמת, קלטו את הספרים של {e.fiscalYear - 1} (מבנה אחיד או כרטסת).</p>
        )}
        {write && (
          <LedgerImportForm action={importLedgerAction.bind(null, e.id, "prior")} label={`קליטת שנה קודמת (${e.fiscalYear - 1})`} />
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <strong>{flagged.length}</strong> סעיפים דורשים הסבר · הוסברו{" "}
              <strong className={explained === flagged.length ? "text-brand" : "text-warn"}>{explained}</strong>
            </p>
            {hasGroups && (
              <div className="pills text-sm">
                <Link href={`/audit/${e.id}?tab=analytics&by=account`} className={`pill ${by === "account" ? "pill-active" : ""}`}>
                  לפי חשבון
                </Link>
                <Link href={`/audit/${e.id}?tab=analytics&by=group`} className={`pill ${by === "group" ? "pill-active" : ""}`}>
                  לפי קבוצה במאזן
                </Link>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{by === "group" ? "קבוצה" : "חשבון"}</th>
                  <th className="text-end">{e.fiscalYear - 1}</th>
                  <th className="text-end">{e.fiscalYear}</th>
                  <th className="text-end">שינוי</th>
                  <th className="text-end">%</th>
                  <th className="min-w-64">הסבר</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.flag ? "" : "text-muted"}>
                    <td>
                      {r.label}
                      {r.flag && <span className="badge badge-warn ms-2">{FLAG_TEXT[r.flag]}</span>}
                    </td>
                    <td className="num text-end">{formatILS(r.prior)}</td>
                    <td className="num text-end">{formatILS(r.current)}</td>
                    <td className="num text-end">{formatILS(r.change)}</td>
                    <td className="num text-end">{pct(r.changePct)}</td>
                    <td>
                      {r.flag &&
                        (write ? (
                          <NoteForm action={saveNoteAction.bind(null, e.id, `analytics:${r.key}`)} {...noteFor(`analytics:${r.key}`)} />
                        ) : (
                          <span className="text-xs">{noteFor(`analytics:${r.key}`).initial ?? "—"}</span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            מסומן: שינוי שגם גדול מהמהותיות לביצוע ({formatILS(performance)}) וגם עולה על 10%, וחשבונות חדשים או שנסגרו בסכום מהותי.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="card-title">חודשים חריגים ב־{e.fiscalYear}</h2>
        {spikes.length === 0 ? (
          <p className="text-sm text-muted">לא נמצאו חודשים חריגים מעל המהותיות.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>חשבון</th>
                  <th>חודש</th>
                  <th className="text-end">תנועה בחודש</th>
                  <th className="text-end">ממוצע חודשי</th>
                  <th className="min-w-64">הסבר</th>
                </tr>
              </thead>
              <tbody>
                {spikes.map((s) => {
                  const key = `spike:${s.accountCode}:${s.month}`;
                  return (
                    <tr key={key}>
                      <td>
                        <span className="num">{s.accountCode}</span> · {s.accountName}
                      </td>
                      <td className="num">{s.month.split("-").reverse().join("/")}</td>
                      <td className="num text-end">{formatILS(s.movement)}</td>
                      <td className="num text-end">{formatILS(s.average)}</td>
                      <td>
                        {write ? (
                          <NoteForm action={saveNoteAction.bind(null, e.id, key)} {...noteFor(key)} />
                        ) : (
                          <span className="text-xs">{noteFor(key).initial ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReconTab({
  data,
  statements,
  notes,
  tolerance,
  write,
}: {
  data: Data;
  statements: Awaited<ReturnType<typeof listBankStatements>>;
  notes: Awaited<ReturnType<typeof listNotes>>;
  tolerance: number;
  write: boolean;
}) {
  const e = data.engagement;
  const from = `${e.fiscalYear}-01-01`;
  const accountOptions = data.accounts.map((a) => ({ code: a.code, name: a.name }));
  const bankLike = data.accounts.find((a) => /בנק/.test(a.name))?.code;
  const noteProps = (key: string) => {
    const n = notes.get(key);
    return {
      initial: n?.text,
      meta: n ? `${n.author ?? ""} · ${n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : undefined,
    };
  };
  const vatConfig = e.vatConfig as VatConfig | null;
  const suggested = suggestVatAccounts(data.accounts);
  const vatMonths = vatConfig
    ? vatReasonableness(data.lines, { ...vatConfig, tolerance, from, to: e.yearEnd })
    : [];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">התאמת בנק</h2>
        {write && (
          <div className="card space-y-2">
            <p className="text-xs text-muted">
              בחרו את חשבון הבנק בספרים והעלו את דף הבנק של אותו חשבון (CSV מאתר הבנק). מומלץ לכלול גם את חודש
              ינואר של השנה הבאה, כדי לזהות צ׳קים והפקדות שנפרעו אחרי סוף השנה.
            </p>
            <BankStatementForm action={importBankStatementAction.bind(null, e.id)} accounts={accountOptions} defaultAccount={bankLike} />
          </div>
        )}
        {statements.length === 0 && <p className="text-sm text-muted">עדיין לא נקלטו דפי בנק.</p>}
        {statements.map((st) => {
          const account = data.accounts.find((a) => a.code === st.accountCode);
          const fileBalance = statementBalanceAt(st.rows, e.yearEnd);
          const bankBalance = st.balanceOverride ?? fileBalance;
          const r = reconcileBank(
            data.lines.filter((l) => l.accountCode === st.accountCode),
            st.rows,
            { from, to: e.yearEnd, openingBookBalance: account?.openingBalance ?? 0, bankBalance },
          );
          const ok = r.unexplained === 0;
          const key = `bankrec:${st.accountCode}`;
          return (
            <div key={st.id} className="card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">
                  <span className="num">{st.accountCode}</span> · {account?.name}
                </h3>
                <span className="text-xs text-muted">
                  דף בנק: <span className="num">{st.filename}</span> · {st.rows.length.toLocaleString("he-IL")} תנועות
                </span>
              </div>
              <table className="table max-w-xl">
                <tbody>
                  <tr>
                    <td>יתרה בבנק ב־{formatDate(e.yearEnd)}</td>
                    <td className="num text-end">{bankBalance === null ? "לא ידועה" : formatILS(bankBalance)}</td>
                  </tr>
                  <tr>
                    <td>+ רשום בספרים ועוד לא בבנק ({r.bookOnly.length + r.clearedAfterYearEnd.length})</td>
                    <td className="num text-end">{formatILS(r.inBooksNotBankTotal)}</td>
                  </tr>
                  <tr>
                    <td>− בבנק ולא רשום בספרים ({r.bankOnly.length})</td>
                    <td className="num text-end">{formatILS(r.bankOnlyTotal)}</td>
                  </tr>
                  <tr className="font-bold">
                    <td>יתרה בספרים</td>
                    <td className="num text-end">{formatILS(r.bookBalance)}</td>
                  </tr>
                  <tr className={ok ? "text-brand" : "text-danger"}>
                    <td className="font-bold">הפרש לא מוסבר</td>
                    <td className="num text-end font-bold">
                      {r.unexplained === null ? "—" : ok ? "0 ✓ מותאם" : formatILS(r.unexplained)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {bankBalance === null && (
                <p className="text-xs text-warn">בדף הבנק אין עמודת יתרה — הזינו את היתרה לפי אישור היתרה מהבנק.</p>
              )}
              {write && (
                <StatementBalanceForm action={setStatementBalanceAction.bind(null, e.id, st.accountCode)} initial={st.balanceOverride} />
              )}
              <ReconList
                title="נפרעו בבנק רק אחרי סוף השנה (ראיה לפריט פתוח)"
                rows={r.clearedAfterYearEnd.map((m) => ({
                  date: m.book.date,
                  text: `${m.book.description || "—"} · נפרע ב־${formatDate(m.bank.date)}`,
                  amount: m.book.amount,
                }))}
              />
              <ReconList
                title="רשום בספרים ולא נמצא בבנק — לבדוק"
                rows={r.bookOnly.map((l) => ({ date: l.date, text: l.description || "—", amount: l.amount }))}
                danger
              />
              <ReconList
                title="בבנק ולא נרשם בספרים — לבדוק (עמלות, ריבית, תקבולים שלא נרשמו)"
                rows={r.bankOnly.map((b) => ({ date: b.date, text: b.description, amount: b.amount }))}
                danger
              />
              <p className="text-xs text-muted">
                הותאמו {r.matched.length.toLocaleString("he-IL")} תנועות (סכום זהה, עד 7 ימים הפרש).
              </p>
              {write ? <NoteForm action={saveNoteAction.bind(null, e.id, key)} {...noteProps(key)} /> : null}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">סבירות מע״מ עסקאות</h2>
        <p className="text-sm text-muted">
          לכל חודש: ההכנסות בספרים כפול שיעור המע״מ באותו חודש, מול המע״מ שנרשם. פער מעל{" "}
          <span className="num">{formatILS(tolerance)}</span> מסומן — הכנסה בלי מע״מ, מע״מ שלא נרשם, או הכנסות פטורות /
          יצוא שצריך לתעד.
        </p>
        {write && (
          <div className="card">
            <VatConfigForm
              action={setVatConfigAction.bind(null, e.id)}
              accounts={accountOptions}
              revenue={vatConfig?.revenueAccounts ?? suggested.revenue}
              outputVat={vatConfig?.outputVatAccounts ?? suggested.outputVat}
            />
          </div>
        )}
        {vatConfig && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>חודש</th>
                  <th className="text-end">הכנסות</th>
                  <th className="text-end">מע״מ צפוי</th>
                  <th className="text-end">מע״מ שנרשם</th>
                  <th className="text-end">פער</th>
                  <th className="min-w-64">הסבר</th>
                </tr>
              </thead>
              <tbody>
                {vatMonths.map((m) => (
                  <tr key={m.month} className={m.flagged ? "" : "text-muted"}>
                    <td className="num">
                      {m.month.split("-").reverse().join("/")} <span className="text-xs">({m.rate}%)</span>
                    </td>
                    <td className="num text-end">{formatILS(m.revenue)}</td>
                    <td className="num text-end">{formatILS(m.expectedVat)}</td>
                    <td className="num text-end">{formatILS(m.recordedVat)}</td>
                    <td className={`num text-end ${m.flagged ? "font-bold text-danger" : ""}`}>{formatILS(m.difference)}</td>
                    <td>
                      {m.flagged && write && <NoteForm action={saveNoteAction.bind(null, e.id, `vat:${m.month}`)} {...noteProps(`vat:${m.month}`)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ReconList({
  title,
  rows,
  danger,
}: {
  title: string;
  rows: { date: string; text: string; amount: number }[];
  danger?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-lg border border-border p-3" open={danger && rows.length <= 10}>
      <summary className={`cursor-pointer text-sm font-medium ${danger ? "text-danger" : ""}`}>
        {title} · {rows.length}
      </summary>
      <table className="table mt-2">
        <tbody>
          {rows.slice(0, 100).map((r, i) => (
            <tr key={i}>
              <td className="num whitespace-nowrap">{formatDate(r.date)}</td>
              <td>{r.text}</td>
              <td className="num text-end">{formatILS(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && <p className="text-xs text-muted">מוצגות 100 הראשונות מתוך {rows.length}.</p>}
    </details>
  );
}
