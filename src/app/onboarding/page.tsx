import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding-form";
import { requireUser } from "@/lib/auth/dal";
import { listOrganizationsForUser } from "@/lib/services/members";

export default async function OnboardingPage() {
  const { user } = await requireUser();
  const hasOrgs = (await listOrganizationsForUser(user.id)).length > 0;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">ח</span>
        <p className="font-bold">ביקורת חכמה</p>
      </div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{hasOrgs ? "הוספת משרד" : "נקים את המשרד"}</h1>
      <p className="mb-6 text-muted">
        כל תיקי הביקורת, הצוות וההרשאות שייכים למשרד. אפשר להקים כמה משרדים ולעבור ביניהם.
      </p>
      <div className="card">
        <OnboardingForm />
      </div>
      {hasOrgs && (
        <Link href="/audit" className="link mt-4 inline-block text-sm">
          חזרה ללוח הבקרה
        </Link>
      )}
    </main>
  );
}
