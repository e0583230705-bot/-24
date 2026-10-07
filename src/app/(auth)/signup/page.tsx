import { SignupForm } from "@/components/auth-forms";

export default function SignupPage() {
  return (
    <>
      <div className="card p-6">
        <h1 className="text-xl font-bold">יצירת חשבון</h1>
        <p className="mb-5 text-sm text-muted">אחרי ההרשמה נקים את המשרד שלך</p>
        <SignupForm />
      </div>
    </>
  );
}
