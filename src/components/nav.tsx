"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons, type IconName } from "./icons";

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** צבע האזור (מחלקות Tailwind לרקע ולטקסט של בועת האייקון) */
  tone: string;
  /** נתיבים נוספים ששייכים לאזור הזה */
  also?: string[];
}

/* ארבעה אזורים בלבד. כל מה שבפנים מגיע דרך לשוניות־משנה בתוך האזור. */
export const NAV: NavLink[] = [
  { href: "/audit", label: "תיקי ביקורת", icon: "audit", tone: "bg-violet-soft text-violet" },
  { href: "/settings", label: "המשרד והצוות", icon: "settings", tone: "bg-amber-soft text-amber" },
];

export function isActive(pathname: string, l: { href: string; also?: string[] }) {
  if (l.href === "/") return pathname === "/" || (l.also ?? []).some((p) => pathname.startsWith(p));
  return pathname.startsWith(l.href) || (l.also ?? []).some((p) => pathname.startsWith(p));
}

/** תפריט צד למסך רחב: אריחים עם בועת אייקון צבעונית */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1.5" aria-label="ניווט ראשי">
      {NAV.map((l) => {
        const active = isActive(pathname, l);
        const Icon = Icons[l.icon];
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
              active ? "bg-surface text-text shadow-card" : "text-muted hover:bg-surface/70 hover:text-text"
            }`}
          >
            <span className={`bubble h-9 w-9 rounded-xl ${l.tone} ${active ? "" : "opacity-80"}`}>
              <Icon size={18} />
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** תפריט לנייד: ארבעה אייקונים בשורה */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-2 gap-1" aria-label="ניווט ראשי">
      {NAV.map((l) => {
        const active = isActive(pathname, l);
        const Icon = Icons[l.icon];
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${
              active ? "bg-surface-2 text-text" : "text-muted"
            }`}
          >
            <span className={`bubble h-8 w-8 rounded-xl ${l.tone}`}>
              <Icon size={16} />
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** לשוניות־משנה בתוך אזור (למשל: לוח / הכנסות / הוצאות / לקוחות / בנק) */
export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="pills w-fit max-w-full overflow-x-auto" aria-label="ניווט משני">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`pill ${active ? "pill-active" : ""}`} aria-current={active ? "page" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
