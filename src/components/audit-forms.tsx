"use client";

import type { FormState } from "@/app/actions";
import { createEngagementAction } from "@/app/actions";
import { MATERIALITY_BASES } from "@/lib/domain/ledger/materiality";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function CreateEngagementForm({ defaultYear }: { defaultYear: number }) {
  const [state, action, pending, ready] = useFormAction<FormState>(createEngagementAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input name="clientName" placeholder="שם הלקוח המבוקר" aria-label="שם הלקוח המבוקר" required className="input" />
        <input name="clientTaxId" placeholder="ח.פ. / מספר עוסק" aria-label="ח.פ." inputMode="numeric" className="input num" />
        <input
          name="fiscalYear"
          type="number"
          defaultValue={defaultYear}
          aria-label="שנת הדוח"
          min={2000}
          max={2100}
          required
          className="input num"
        />
        <button className="btn" disabled={pending || !ready}>
          פתיחת תיק
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function LedgerImportForm({
  action: serverAction,
  label = "קליטת הנתונים",
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  label?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.txt,text/csv,text/plain"
          multiple
          required
          aria-label="קובצי הנהלת החשבונות"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : label}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

export function MaterialityForm({
  action: serverAction,
  initial,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial: { basis: string | null; base: number | null; pct: number | null };
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
        <div>
          <label className="label" htmlFor="basis">בסיס לחישוב</label>
          <select id="basis" name="basis" defaultValue={initial.basis ?? "profit_before_tax"} className="input">
            {Object.entries(MATERIALITY_BASES).map(([key, b]) => (
              <option key={key} value={key}>
                {b.label} ({b.defaultPct}%)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pct">אחוז</label>
          <input id="pct" name="pct" inputMode="decimal" defaultValue={initial.pct ?? 5} required className="input num" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="base">סכום הבסיס בש״ח</label>
          <input
            id="base"
            name="base"
            inputMode="decimal"
            placeholder="למשל 1,250,000"
            defaultValue={initial.base ? (initial.base / 100).toFixed(2) : ""}
            required
            className="input num"
          />
        </div>
        <button className="btn-ghost" disabled={pending || !ready}>
          חישוב
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function NoteForm({
  action: serverAction,
  initial,
  meta,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial?: string;
  meta?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-1">
      <div className="flex gap-2">
        <textarea
          name="text"
          rows={1}
          defaultValue={initial}
          placeholder="הסבר לשינוי ומה נבדק"
          aria-label="הסבר"
          className="input min-h-9 text-xs"
        />
        <button className="btn-ghost text-xs" disabled={pending || !ready}>
          {pending ? "..." : "שמירה"}
        </button>
      </div>
      {meta && <p className="text-[11px] text-muted">{meta}</p>}
      {state.ok && !pending && <p className="text-[11px] text-brand">נשמר</p>}
      <FormError message={state.error} />
    </form>
  );
}

export function BankStatementForm({
  action: serverAction,
  accounts,
  defaultAccount,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  accounts: { code: string; name: string }[];
  defaultAccount?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <select name="accountCode" defaultValue={defaultAccount ?? ""} required aria-label="חשבון הבנק בספרים" className="input w-auto">
          <option value="" disabled>
            חשבון הבנק בספרים...
          </option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          required
          aria-label="דף בנק"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : "קליטת דף בנק"}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

export function StatementBalanceForm({
  action: serverAction,
  initial,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial: number | null;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor="balance" className="text-muted">
        יתרת בנק לפי אישור הבנק (אם שונה מהקובץ):
      </label>
      <input
        id="balance"
        name="balance"
        inputMode="decimal"
        defaultValue={initial === null ? "" : (initial / 100).toFixed(2)}
        className="input num w-36 text-xs"
      />
      <button className="btn-ghost text-xs" disabled={pending || !ready}>
        עדכון
      </button>
      <FormError message={state.error} />
    </form>
  );
}

export function VatConfigForm({
  action: serverAction,
  accounts,
  revenue,
  outputVat,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  accounts: { code: string; name: string }[];
  revenue: string[];
  outputVat: string[];
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  const options = accounts.map((a) => (
    <option key={a.code} value={a.code}>
      {a.code} · {a.name}
    </option>
  ));
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="label">חשבונות הכנסות</span>
          <select name="revenueAccounts" multiple size={6} defaultValue={revenue} className="input">
            {options}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">חשבון מע״מ עסקאות</span>
          <select name="outputVatAccounts" multiple size={6} defaultValue={outputVat} className="input">
            {options}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">אפשר לבחור כמה חשבונות (Ctrl / לחיצה ארוכה). ההצעה הראשונית לפי שמות החשבונות.</p>
      <button className="btn-ghost" disabled={pending || !ready}>
        שמירת הבחירה
      </button>
      <FormError message={state.error} />
    </form>
  );
}
