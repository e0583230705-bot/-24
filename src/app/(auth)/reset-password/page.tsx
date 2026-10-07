import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <>
      <div className="card p-6">
        <h1 className="mb-5 text-xl font-bold">בחירת סיסמה חדשה</h1>
        {typeof token === "string" && token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm">
            הקישור חסר או לא תקין.{" "}
            <Link href="/forgot-password" className="link">
              בקשו קישור חדש
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
