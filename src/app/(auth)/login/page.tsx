import { LoginForm } from "@/components/auth-forms";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <div className="card p-6">
        <h1 className="text-xl font-bold">התחברות</h1>
        <p className="mb-5 text-sm text-muted">ברוכים השבים</p>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </>
  );
}
