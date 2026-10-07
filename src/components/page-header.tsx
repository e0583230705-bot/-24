import Link from "next/link";
import type { ReactNode } from "react";
import { Icons } from "./icons";

/** כותרת דף אחידה: קישור חזרה (אופציונלי), כותרת, משפט הסבר קצר, וכפתורי פעולה בצד */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        {back && (
          <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
            <Icons.arrowBack size={16} />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** מצב ריק ידידותי: מה אין כאן, ומה הצעד הראשון */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icons.inbox size={22} />
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** קופסה מתקפלת לטפסים שלא צריכים להיות פתוחים כל הזמן */
export function Collapsible({
  title,
  description,
  open,
  children,
}: {
  title: string;
  description?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="panel card p-0" open={open}>
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-bold">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <Icons.chevronDown size={18} className="chevron shrink-0 text-muted transition" />
      </summary>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}
