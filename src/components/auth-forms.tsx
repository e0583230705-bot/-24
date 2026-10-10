"use client";

import Link from "next/link";
import { loginAction, signupAction, verifyLoginAction, type FormState } from "@/app/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending, ready] = useFormAction<FormState>(loginAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div>
        <label className="label" htmlFor="email">אימייל</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input num" />
      </div>
      <div>
        <label className="label" htmlFor="password">סיסמה</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input num"
        />
      </div>
      <FormError message={state.error} />
      <button className="btn w-full" disabled={pending || !ready}>
        {pending ? "מתחבר..." : "התחברות"}
      </button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-brand">
          שכחתי סיסמה
        </Link>
      </p>
      <p className="text-center text-sm text-muted">
        אין לך חשבון?{" "}
        <Link href="/signup" className="text-brand">
          הרשמה
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending, ready] = useFormAction<FormState>(signupAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">שם מלא</label>
        <input id="name" name="name" autoComplete="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">אימייל</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input num" />
      </div>
      <div>
        <label className="label" htmlFor="password">סיסמה</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className="input num"
        />
        <p className="mt-1 text-xs text-muted">לפחות {PASSWORD_MIN_LENGTH} תווים</p>
      </div>
      <FormError message={state.error} />
      <button className="btn w-full" disabled={pending || !ready}>
        {pending ? "נרשם..." : "יצירת חשבון"}
      </button>
      <p className="text-center text-sm text-muted">
        כבר רשום?{" "}
        <Link href="/login" className="text-brand">
          התחברות
        </Link>
      </p>
    </form>
  );
}

/** שלב שני בכניסה: קוד מאפליקציית האימות (או קוד גיבוי) */
export function VerifyLoginForm({ next }: { next?: string }) {
  const [state, action, pending, ready] = useFormAction<FormState>(verifyLoginAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div>
        <label className="label" htmlFor="code">קוד אימות</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          className="input num text-center text-lg tracking-[0.3em]"
        />
        <p className="mt-1 text-xs text-muted">6 ספרות מאפליקציית האימות. אין גישה לטלפון? אפשר להקליד קוד גיבוי.</p>
      </div>
      <FormError message={state.error} />
      <button className="btn w-full" disabled={pending || !ready}>
        {pending ? "בודק..." : "כניסה"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted hover:text-brand">
          חזרה להתחברות
        </Link>
      </p>
    </form>
  );
}
