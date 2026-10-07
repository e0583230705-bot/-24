"use client";

import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction, type FormState } from "@/app/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function ForgotPasswordForm() {
  const [state, action, pending, ready] = useFormAction<FormState>(requestPasswordResetAction, {});
  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{state.message}</p>
        <Link href="/login" className="text-sm text-brand">
          חזרה להתחברות
        </Link>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">אימייל</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input num" />
      </div>
      <FormError message={state.error} />
      <button className="btn w-full" disabled={pending || !ready}>
        {pending ? "שולח..." : "שליחת קישור לאיפוס"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending, ready] = useFormAction<FormState>(resetPasswordAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">סיסמה חדשה</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className="input num"
        />
        <p className="mt-1 text-xs text-muted">לפחות {PASSWORD_MIN_LENGTH} תווים. כל המכשירים המחוברים ינותקו.</p>
      </div>
      <FormError message={state.error} />
      <button className="btn w-full" disabled={pending || !ready}>
        {pending ? "שומר..." : "שמירת הסיסמה"}
      </button>
    </form>
  );
}
