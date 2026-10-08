"use client";

import type { FormState } from "@/app/actions";
import { PAYROLL_GROUPS, type PayrollAccountGroup, type PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function PayrollImportForm({ action: serverAction, hasFile }: { action: (s: FormState, f: FormData) => Promise<FormState>; hasFile: boolean }) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".txt,.126,.dat,text/plain"
          required
          aria-label="קובץ 126"
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : hasFile ? "קליטה מחדש" : "קליטת קובץ 126"}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

/** מיפוי חשבונות השכר בספרים: בחירה מרובה לכל קבוצה */
export function PayrollMappingForm({
  action: serverAction,
  accounts,
  mapping,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  accounts: { code: string; name: string }[];
  mapping: PayrollAccountMap;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  const groups = Object.keys(PAYROLL_GROUPS) as PayrollAccountGroup[];
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <label key={g} className="text-sm">
            <span className="label">{PAYROLL_GROUPS[g].label}</span>
            <select name={g} multiple size={4} defaultValue={mapping[g] ?? []} className="input text-xs">
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            {PAYROLL_GROUPS[g].hint && <span className="help">{PAYROLL_GROUPS[g].hint}</span>}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">ההצעה הראשונית לפי שמות החשבונות. אפשר לבחור כמה חשבונות (Ctrl / לחיצה ארוכה).</p>
      <button className="btn-ghost" disabled={pending || !ready}>
        שמירת המיפוי
      </button>
      <FormError message={state.error} />
      {state.ok && !pending && <p className="text-sm text-brand">נשמר</p>}
    </form>
  );
}

export function PayslipsImportForm({
  action: serverAction,
  hasFile,
  labels = { first: "קליטת ריכוז שכר", aria: "ריכוז שכר" },
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  hasFile: boolean;
  labels?: { first: string; aria: string };
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          required
          aria-label={labels.aria}
          className="text-sm text-muted file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-soft file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <button className="btn" disabled={pending || !ready}>
          {pending ? "קולט..." : hasFile ? "קליטה מחדש" : labels.first}
        </button>
      </div>
      <FormError message={state.error} />
      {state.message && <p className="text-sm text-brand">{state.message}</p>}
    </form>
  );
}

/** מיפוי עמודות הקובץ לשדות הקנוניים: לכל שדה — בחירת עמודה (או ריק) */
export function PayslipMappingForm({
  action: serverAction,
  headers,
  mapping,
  fields,
  hint = "* שדות חובה. שאר השדות פותחים בדיקות נוספות (שכר מינימום, שעות נוספות, פנסיה, חשבון בנק…).",
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  headers: string[];
  mapping: Partial<Record<string, number>>;
  fields: { key: string; label: string; required?: boolean }[];
  hint?: string;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
            <span className={`shrink-0 ${f.required ? "font-semibold" : ""}`}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </span>
            <select name={f.key} defaultValue={mapping[f.key] === undefined ? "" : String(mapping[f.key])} className="input w-48 py-1.5 text-xs">
              <option value="">—</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `עמודה ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <button className="btn-ghost" disabled={pending || !ready}>
        שמירת המיפוי
      </button>
      <FormError message={state.error} />
      {state.ok && !pending && <p className="text-sm text-brand">נשמר</p>}
    </form>
  );
}
