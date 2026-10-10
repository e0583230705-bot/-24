import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { totpCode } from "@/lib/auth/totp";
import { authenticate, registerUser } from "./auth";
import {
  completePendingLogin,
  confirmTwoFactorSetup,
  createPendingLogin,
  disableTwoFactor,
  needsSecondFactor,
  startTwoFactorSetup,
  twoFactorStatus,
} from "./two-factor";

const PASSWORD = "correct horse battery";
const user = (email: string) => registerUser({ email, name: "רו\"ח", password: PASSWORD });

describe("two-factor login", () => {
  it("enables with a confirmation code, stores the secret encrypted, and returns one-time backup codes", async () => {
    const u = await user("2fa1@example.com");
    expect(await needsSecondFactor(u.id)).toBe(false);
    const { secret, url } = await startTwoFactorSetup(u.id);
    expect(url).toContain(`secret=${secret}`);
    // עדיין לא פעיל עד האישור
    expect(await needsSecondFactor(u.id)).toBe(false);
    await expect(confirmTwoFactorSetup(u.id, "000000")).rejects.toThrow(/שגוי/);
    const codes = await confirmTwoFactorSetup(u.id, totpCode(secret));
    expect(codes).toHaveLength(8);
    expect(await twoFactorStatus(u.id)).toMatchObject({ enabled: true, backupCodesLeft: 8 });
    const db = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.totpSecret).not.toContain(secret);
    await expect(startTwoFactorSetup(u.id)).rejects.toThrow(/כבר פעיל/);
  });

  it("completes a login with the app code or a backup code (once), and rejects wrong codes", async () => {
    const u = await user("2fa2@example.com");
    const { secret } = await startTwoFactorSetup(u.id);
    const codes = await confirmTwoFactorSetup(u.id, totpCode(secret));

    const t1 = await createPendingLogin(u.id);
    await expect(completePendingLogin(t1, "123456")).rejects.toThrow(/שגוי/);
    expect(await completePendingLogin(t1, totpCode(secret))).toBe(u.id);
    // הטוקן נמחק אחרי הצלחה
    await expect(completePendingLogin(t1, totpCode(secret))).rejects.toThrow(/פג תוקף/);

    const t2 = await createPendingLogin(u.id);
    expect(await completePendingLogin(t2, codes[0].toUpperCase())).toBe(u.id);
    const t3 = await createPendingLogin(u.id);
    await expect(completePendingLogin(t3, codes[0])).rejects.toThrow(/שגוי/);
    expect((await twoFactorStatus(u.id)).backupCodesLeft).toBe(7);
    await expect(completePendingLogin("not-a-token", totpCode(secret))).rejects.toThrow(/פג תוקף/);
  });

  it("locks the account after 5 wrong codes even across fresh password logins", async () => {
    const u = await user("2fa3@example.com");
    const { secret } = await startTwoFactorSetup(u.id);
    await confirmTwoFactorSetup(u.id, totpCode(secret));
    for (let i = 0; i < 4; i++) {
      // כל פעם כניסה חדשה בסיסמה — זה לא מאפס את מונה הקודים השגויים
      await authenticate("2fa3@example.com", PASSWORD);
      await expect(completePendingLogin(await createPendingLogin(u.id), "000000")).rejects.toThrow(/שגוי/);
    }
    await authenticate("2fa3@example.com", PASSWORD);
    await expect(completePendingLogin(await createPendingLogin(u.id), "000000")).rejects.toThrow(/ננעל/);
    await expect(authenticate("2fa3@example.com", PASSWORD)).rejects.toThrow(/ניסיונות/);
  });

  it("disables only with a valid code", async () => {
    const u = await user("2fa4@example.com");
    const { secret } = await startTwoFactorSetup(u.id);
    await confirmTwoFactorSetup(u.id, totpCode(secret));
    await expect(disableTwoFactor(u.id, "000000")).rejects.toThrow(/שגוי/);
    await disableTwoFactor(u.id, totpCode(secret));
    expect(await twoFactorStatus(u.id)).toMatchObject({ enabled: false, backupCodesLeft: 0 });
    await expect(disableTwoFactor(u.id, totpCode(secret))).rejects.toThrow(/אינו פעיל/);
  });
});
