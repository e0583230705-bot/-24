import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/dal";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/audit");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">ח</span>
        <div className="leading-tight">
          <p className="font-bold">ביקורת חכמה</p>
          <p className="text-xs text-muted">למשרדי רואי חשבון</p>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
