import { ForgotPasswordForm } from "@/components/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="card p-6">
        <h1 className="text-xl font-bold">שכחתי סיסמה</h1>
        <p className="mb-5 text-sm text-muted">נשלח אליך קישור לבחירת סיסמה חדשה</p>
        <ForgotPasswordForm />
      </div>
    </>
  );
}
