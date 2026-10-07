import Link from "next/link";
import { MobileNav, SideNav } from "@/components/nav";
import { Icons } from "@/components/icons";
import { getContext } from "@/lib/auth/dal";
import { logoutAction, switchOrganizationAction } from "@/app/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, org, orgs } = await getContext();
  const initials = user.name.trim().slice(0, 1) || "?";

  return (
    <div className="min-h-screen">
      {/* פס עליון דק: לוגו + המשרד הפעיל, ובצד השני המשתמש */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/audit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-violet text-sm font-black text-white shadow-sm"
              aria-label="דף הבית"
            >
              ח
            </Link>
            {orgs.length > 1 ? (
              <form action={switchOrganizationAction} className="flex min-w-0 items-center gap-2">
                <select
                  name="orgId"
                  defaultValue={org.id}
                  className="input w-auto max-w-[14rem] truncate py-1.5 font-semibold"
                  aria-label="החלפת משרד"
                >
                  {orgs.map(({ org: o }) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost btn-sm">החלף</button>
              </form>
            ) : (
              <p className="truncate font-bold">{org.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/onboarding" className="btn-ghost btn-sm hidden sm:inline-flex">
              <Icons.plus size={14} />
              משרד נוסף
            </Link>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-soft text-sm font-bold text-pink"
              title={`${user.name} · ${user.email}`}
            >
              {initials}
            </span>
            <form action={logoutAction}>
              <button className="btn-ghost btn-sm" title="התנתקות" aria-label="התנתקות">
                <Icons.logout size={14} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 md:px-6 md:py-8">
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-20">
            <SideNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 space-y-6 pb-24 md:pb-0">{children}</main>
      </div>

      {/* בנייד: התפריט למטה, כמו באפליקציה */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-2 py-1.5 backdrop-blur md:hidden">
        <MobileNav />
      </nav>
    </div>
  );
}
