import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret, encryptSecret, hashBackupCode, newBackupCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import { ValidationError } from "./organizations";

/** כמה זמן יש להקליד את הקוד אחרי הסיסמה */
export const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_LOGIN = 5;
const MAX_TOTP_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function getUser(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new ValidationError("המשתמש לא נמצא");
  return u;
}

export async function twoFactorStatus(userId: string) {
  const u = await getUser(userId);
  return { enabled: Boolean(u.totpEnabledAt), enabledAt: u.totpEnabledAt, backupCodesLeft: Array.isArray(u.backupCodes) ? u.backupCodes.length : 0 };
}

/** שלב 1: סוד חדש (עדיין לא פעיל). מחזיר את הסוד והכתובת לסריקה */
export async function startTwoFactorSetup(userId: string) {
  const u = await getUser(userId);
  if (u.totpEnabledAt) throw new ValidationError("האימות הדו־שלבי כבר פעיל");
  const secret = newTotpSecret();
  const db = await getDb();
  await db.update(schema.users).set({ totpSecret: encryptSecret(secret) }).where(eq(schema.users.id, userId));
  return { secret, url: otpauthUrl(secret, u.email) };
}

/** שלב 2: אישור בקוד מהאפליקציה. מחזיר קודי גיבוי — מוצגים פעם אחת בלבד */
export async function confirmTwoFactorSetup(userId: string, code: string) {
  const u = await getUser(userId);
  if (u.totpEnabledAt) throw new ValidationError("האימות הדו־שלבי כבר פעיל");
  if (!u.totpSecret) throw new ValidationError("יש להתחיל את ההגדרה מחדש");
  if (!verifyTotp(decryptSecret(u.totpSecret), code)) throw new ValidationError("הקוד שגוי. בדקו שהשעה בטלפון נכונה ונסו את הקוד הבא.");
  const codes = newBackupCodes();
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ totpEnabledAt: new Date(), backupCodes: codes.map(hashBackupCode), totpFailures: 0 })
    .where(eq(schema.users.id, userId));
  await logUserAction(userId, "enable_2fa");
  return codes;
}

/** כיבוי — דורש קוד תקף (מהאפליקציה או קוד גיבוי) */
export async function disableTwoFactor(userId: string, code: string) {
  const u = await getUser(userId);
  if (!u.totpEnabledAt || !u.totpSecret) throw new ValidationError("האימות הדו־שלבי אינו פעיל");
  if (!(await checkCode(u, code))) throw new ValidationError("הקוד שגוי");
  const db = await getDb();
  await db.update(schema.users).set({ totpSecret: null, totpEnabledAt: null, backupCodes: null, totpFailures: 0 }).where(eq(schema.users.id, userId));
  await logUserAction(userId, "disable_2fa");
}

/** נרשם ביומן של כל משרד שהמשתמש חבר בו (היומן שייך למשרד; משתמש בלי משרד — לא נרשם) */
async function logUserAction(userId: string, action: string) {
  const db = await getDb();
  const orgs = await db.select({ org: schema.memberships.organizationId }).from(schema.memberships).where(eq(schema.memberships.userId, userId));
  for (const { org } of orgs) {
    await db.insert(schema.auditLog).values({ organizationId: org, action, entity: "user", entityId: userId, data: {} });
  }
}

/** בודק קוד מהאפליקציה, או קוד גיבוי (שנמחק אחרי שימוש) */
async function checkCode(u: typeof schema.users.$inferSelect, code: string): Promise<boolean> {
  if (!u.totpSecret) return false;
  if (verifyTotp(decryptSecret(u.totpSecret), code)) return true;
  const hashes = Array.isArray(u.backupCodes) ? (u.backupCodes as string[]) : [];
  const h = hashBackupCode(code);
  if (!hashes.includes(h)) return false;
  const db = await getDb();
  await db.update(schema.users).set({ backupCodes: hashes.filter((x) => x !== h) }).where(eq(schema.users.id, u.id));
  return true;
}

/* ---------- כניסה בשני שלבים ---------- */

export async function needsSecondFactor(userId: string) {
  return (await twoFactorStatus(userId)).enabled;
}

/** אחרי סיסמה נכונה: טוקן זמני לשלב הקוד (בעוגייה; כאן רק ה־hash) */
export async function createPendingLogin(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.delete(schema.pendingLogins).where(lt(schema.pendingLogins.expiresAt, new Date()));
  await db.insert(schema.pendingLogins).values({ id: hashToken(token), userId, expiresAt: new Date(Date.now() + PENDING_LOGIN_TTL_MS) });
  return token;
}

/**
 * שלב הקוד. מחזיר את מזהה המשתמש כשהקוד נכון.
 * הגנה מניחוש: 5 ניסיונות לכל כניסה, ו־5 קודים שגויים ברצף נועלים את החשבון ל־15 דקות.
 */
export async function completePendingLogin(token: string, code: string): Promise<string> {
  const db = await getDb();
  const id = hashToken(token);
  const [p] = await db
    .select()
    .from(schema.pendingLogins)
    .where(and(eq(schema.pendingLogins.id, id), gt(schema.pendingLogins.expiresAt, new Date())));
  if (!p) throw new ValidationError("פג תוקף הכניסה. יש להזין שוב אימייל וסיסמה.");
  const u = await getUser(p.userId);
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    await db.delete(schema.pendingLogins).where(eq(schema.pendingLogins.id, id));
    throw new ValidationError("יותר מדי ניסיונות כושלים. נסו שוב בעוד כמה דקות.");
  }
  if (await checkCode(u, code)) {
    await db.delete(schema.pendingLogins).where(eq(schema.pendingLogins.userId, u.id));
    if (u.totpFailures > 0) await db.update(schema.users).set({ totpFailures: 0 }).where(eq(schema.users.id, u.id));
    return u.id;
  }
  const failures = u.totpFailures + 1;
  if (failures >= MAX_TOTP_FAILURES) {
    await db.update(schema.users).set({ totpFailures: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }).where(eq(schema.users.id, u.id));
    await db.delete(schema.pendingLogins).where(eq(schema.pendingLogins.userId, u.id));
    throw new ValidationError("יותר מדי קודים שגויים. החשבון ננעל ל־15 דקות.");
  }
  await db.update(schema.users).set({ totpFailures: failures }).where(eq(schema.users.id, u.id));
  const attempts = p.attempts + 1;
  if (attempts >= MAX_ATTEMPTS_PER_LOGIN) {
    await db.delete(schema.pendingLogins).where(eq(schema.pendingLogins.id, id));
    throw new ValidationError("הקוד שגוי. יש להזין שוב אימייל וסיסמה.");
  }
  await db.update(schema.pendingLogins).set({ attempts }).where(eq(schema.pendingLogins.id, id));
  throw new ValidationError("הקוד שגוי");
}
