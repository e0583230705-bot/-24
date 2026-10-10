"use client";

import { disableTwoFactorAction, twoFactorSetupAction, type FormState, type TwoFactorSetupState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

/** הפעלה / כיבוי של אימות דו־שלבי למשתמש המחובר */
export function TwoFactorSettings({ enabled, enabledAt, backupCodesLeft }: { enabled: boolean; enabledAt: string | null; backupCodesLeft: number }) {
  // מצב ההגדרה מוחזק כאן, מעל ההחלפה בין "כבוי" ל"פעיל": אחרי האישור הדף מתרענן ומקבל enabled=true,
  // וקודי הגיבוי (שמוצגים פעם אחת בלבד) חייבים להישאר על המסך
  const setup = useFormAction<TwoFactorSetupState>(twoFactorSetupAction, {});
  if (enabled && !setup[0].backupCodes) return <Enabled enabledAt={enabledAt} backupCodesLeft={backupCodesLeft} />;
  return <Setup form={setup} />;
}

function Setup({ form }: { form: ReturnType<typeof useFormAction<TwoFactorSetupState>> }) {
  const [state, action, pending, ready] = form;
  if (state.backupCodes) {
    return (
      <div className="space-y-3">
        <p className="notice notice-good">האימות הדו־שלבי פעיל. מעכשיו, בכל כניסה תתבקשו גם לקוד מהאפליקציה.</p>
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="font-bold">קודי גיבוי — שמרו אותם עכשיו</p>
          <p className="text-xs text-muted">כל קוד עובד פעם אחת, למקרה שהטלפון אבד. הם לא יוצגו שוב.</p>
          <ul className="num grid grid-cols-2 gap-1 text-sm font-semibold" dir="ltr">
            {state.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (state.secret && state.qr) {
    return (
      <form method="post" onSubmit={action} className="space-y-3">
        <input type="hidden" name="step" value="confirm" />
        <p className="text-sm">
          1. סרקו את הקוד באפליקציית אימות (Google Authenticator, Microsoft Authenticator וכו&apos;).
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {/* SVG שנוצר בשרת מהכתובת שלנו בלבד */}
          <div className="h-44 w-44 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: state.qr }} />
          <div className="space-y-1 text-xs text-muted">
            <p>אי אפשר לסרוק? הקלידו את המפתח ידנית:</p>
            <p className="num select-all break-all font-semibold text-text" dir="ltr">
              {state.secret.replace(/(.{4})/g, "$1 ").trim()}
            </p>
          </div>
        </div>
        <label className="block text-sm" htmlFor="tf-code">
          2. הקלידו את הקוד שהאפליקציה מציגה
        </label>
        <div className="flex gap-2">
          <input id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input num w-40 text-center tracking-[0.3em]" />
          <button className="btn" disabled={pending || !ready}>
            {pending ? "בודק..." : "הפעלה"}
          </button>
        </div>
        <FormError message={state.error} />
      </form>
    );
  }
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <input type="hidden" name="step" value="start" />
      <p className="text-sm text-muted">בנוסף לסיסמה, קוד מתחלף מהטלפון. מומלץ מאוד — המערכת מחזיקה נתוני שכר ומספרי זהות.</p>
      <button className="btn" disabled={pending || !ready}>
        {pending ? "מכין..." : "הפעלת אימות דו־שלבי"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

function Enabled({ enabledAt, backupCodesLeft }: { enabledAt: string | null; backupCodesLeft: number }) {
  const [state, action, pending, ready] = useFormAction<FormState>(disableTwoFactorAction, {});
  return (
    <div className="space-y-3">
      <p className="notice notice-good">
        פעיל{enabledAt ? ` מאז ${new Date(enabledAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}` : ""} · נותרו {backupCodesLeft} קודי גיבוי
      </p>
      <details className="panel">
        <summary className="link text-sm">כיבוי</summary>
        <form method="post" onSubmit={action} className="mt-3 flex flex-wrap items-start gap-2">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="קוד מהאפליקציה או קוד גיבוי" aria-label="קוד" className="input num w-60" />
          <button className="btn-ghost" disabled={pending || !ready}>
            {pending ? "..." : "כיבוי האימות הדו־שלבי"}
          </button>
          <FormError message={state.error} />
        </form>
      </details>
    </div>
  );
}
