import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, SESSION_TTL_MS, validateSession } from "@/lib/services/auth";
import { ForbiddenError, listOrganizationsForUser } from "@/lib/services/members";
import { can, type Action } from "@/lib/domain/permissions";

/**
 * שכבת הגישה לנתונים (DAL): כל דף ופעולה עוברים כאן.
 * זו בדיקת האבטחה האמיתית — ה־proxy רק מפנה מוקדם לדף ההתחברות.
 */
export const SESSION_COOKIE = "session";

export async function startSession(userId: string, activeOrganizationId: string | null = null) {
  const { token, expiresAt } = await createSession(userId, activeOrganizationId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await validateSession(token);
  return row ? { token, user: row.user, activeOrganizationId: row.session.activeOrganizationId } : null;
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** המשתמש, המשרד הפעיל והתפקיד שלו בו. מפנה להתחברות / להקמת משרד לפי הצורך. */
export const getContext = cache(async () => {
  const session = await requireUser();
  const orgs = await listOrganizationsForUser(session.user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const active = orgs.find((o) => o.org.id === session.activeOrganizationId) ?? orgs[0];
  return { ...session, org: active.org, role: active.role, orgs, can: (a: Action) => can(active.role, a) };
});

export async function requirePermission(action: Action) {
  const ctx = await getContext();
  if (!ctx.can(action)) throw new ForbiddenError();
  return ctx;
}

export { SESSION_TTL_MS };
