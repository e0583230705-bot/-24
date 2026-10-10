import { VerifyLoginForm } from "@/components/auth-forms";

export default async function VerifyLoginPage({ searchParams }: PageProps<"/login/verify">) {
  const { next } = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold">אימות דו־שלבי</h1>
      <p className="mb-5 text-sm text-muted">פתחו את אפליקציית האימות והקלידו את הקוד שמופיע בה</p>
      <VerifyLoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
