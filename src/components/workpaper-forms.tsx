"use client";

import type { FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

/** מסקנת נייר העבודה: שמירה = "הוכן" בשם המשתמש */
export function WorkpaperForm({
  action: serverAction,
  initial,
  suggestion,
  prepared,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial?: string;
  /** טיוטת מסקנה מהבדיקות האוטומטיות, כשעוד אין מסקנה */
  suggestion: string;
  prepared: boolean;
}) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-2">
      <textarea
        name="conclusion"
        rows={3}
        defaultValue={initial ?? suggestion}
        aria-label="מסקנה"
        className="input text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" disabled={pending || !ready}>
          {pending ? "שומר..." : prepared ? "עדכון המסקנה" : "סימון כהוכן"}
        </button>
        {prepared && <span className="text-xs text-muted">עדכון מבטל את הסקירה, והסוקר יאשר שוב</span>}
      </div>
      {state.ok && !pending && <p className="text-xs text-brand">נשמר</p>}
      <FormError message={state.error} />
    </form>
  );
}

export function ReviewButton({ action: serverAction }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, action, pending, ready] = useFormAction<FormState>(serverAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-1">
      <button className="btn-ghost btn-sm" disabled={pending || !ready}>
        {pending ? "..." : "אישור סקירה"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}
