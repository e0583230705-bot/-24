import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordProblem } from "@/lib/auth/password-rules";
import { ValidationError } from "./organizations";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function registerUser(input: { email: string; name: string; password: string }) {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("כתובת אימייל לא תקינה");
  if (!input.name.trim()) throw new ValidationError("חסר שם");
  const problem = passwordProblem(input.password);
  if (problem) throw new ValidationError(problem);

  const db = await getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) throw new ValidationError("כבר קיים משתמש עם האימייל הזה");

  const [user] = await db
    .insert(schema.users)
    .values({ email, name: input.name.trim(), passwordHash: await hashPassword(input.password) })
    .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name });
  return user;
}

const INVALID = "אימייל או סיסמה שגויים";

/** מחזיר את המשתמש אם הפרטים נכונים. אחרי 5 ניסיונות כושלים החשבון ננעל ל־15 דקות. */
export async function authenticate(emailInput: string, password: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(emailInput)));
  if (!user) {
    // מבצעים hash גם כשאין משתמש, כדי שזמן התגובה לא יחשוף אילו כתובות רשומות
    await hashPassword(password);
    throw new ValidationError(INVALID);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ValidationError("יותר מדי ניסיונות כושלים. נסו שוב בעוד כמה דקות.");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db
      .update(schema.users)
      .set(
        failed >= MAX_FAILED_LOGINS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedLogins: failed },
      )
      .where(eq(schema.users.id, user.id));
    throw new ValidationError(INVALID);
  }
  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));
  }
  return { id: user.id, email: user.email, name: user.name };
}

/** יוצר סשן ומחזיר את הטוקן לשמירה בעוגייה (רק ה־hash נשמר ב־DB) */
export async function createSession(userId: string, activeOrganizationId: string | null = null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = await getDb();
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, activeOrganizationId, expiresAt });
  // ניקוי סשנים שפגו, כדי שהטבלה לא תתנפח
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, sql`now()`)));
  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const db = await getDb();
  const id = hashToken(token);
  const [row] = await db
    .select({ session: schema.sessions, user: { id: schema.users.id, email: schema.users.email, name: schema.users.name } })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())));
  if (!row) return null;

  // הארכה אוטומטית למשתמשים פעילים
  if (row.session.expiresAt.getTime() - Date.now() < RENEW_WHEN_LEFT_MS) {
    row.session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(schema.sessions).set({ expiresAt: row.session.expiresAt }).where(eq(schema.sessions.id, id));
  }
  return row;
}

export async function setActiveOrganization(token: string, organizationId: string) {
  const db = await getDb();
  await db
    .update(schema.sessions)
    .set({ activeOrganizationId: organizationId })
    .where(eq(schema.sessions.id, hashToken(token)));
}

const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_RESETS_PER_HOUR = 3;

/**
 * יוצר קישור איפוס. מחזיר null כשאין משתמש כזה או כשביקשו יותר מדי —
 * המסך מציג תמיד את אותה הודעה, כדי לא לחשוף אילו כתובות רשומות.
 */
export async function createPasswordReset(emailInput: string) {
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(emailInput)));
  if (!user) return null;

  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.userId, user.id),
        gt(schema.passwordResetTokens.createdAt, new Date(Date.now() - RESET_TTL_MS)),
      ),
    );
  if (recent >= MAX_RESETS_PER_HOUR) return null;

  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResetTokens).values({
    id: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return { user, token };
}

/** מחליף סיסמה, מבטל את כל הסשנים והקישורים הפתוחים של המשתמש ומשחרר נעילה */
export async function resetPassword(token: string, newPassword: string) {
  const problem = passwordProblem(newPassword);
  if (problem) throw new ValidationError(problem);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(and(eq(schema.passwordResetTokens.id, hashToken(token)), gt(schema.passwordResetTokens.expiresAt, new Date())));
  if (!row) throw new ValidationError("הקישור לא תקין או שפג תוקפו. בקשו קישור חדש.");

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null })
      .where(eq(schema.users.id, row.userId));
    await tx.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, row.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
  });
  return row.userId;
}

export async function deleteSession(token: string) {
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}
