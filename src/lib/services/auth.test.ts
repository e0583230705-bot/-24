import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { can } from "@/lib/domain/permissions";
import {
  authenticate,
  createPasswordReset,
  createSession,
  resetPassword,
  deleteSession,
  registerUser,
  setActiveOrganization,
  validateSession,
} from "./auth";
import { addMember, ForbiddenError, getRole, listOrganizationsForUser, removeMember } from "./members";
import { createOrganization } from "./organizations";

const PASSWORD = "correct horse battery";

describe("password hashing", () => {
  it("verifies only the right password and salts every hash", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword("wrong password!", a)).toBe(false);
    expect(await verifyPassword(PASSWORD, "garbage")).toBe(false);
  });
});

describe("permissions", () => {
  it("follows the role matrix", () => {
    expect(can("owner", "manage_members")).toBe(true);
    expect(can("accountant", "write_books")).toBe(true);
    expect(can("accountant", "manage_members")).toBe(false);
    expect(can("viewer", "write_books")).toBe(false);
    expect(can("viewer", "read")).toBe(true);
  });
});

describe("registration and login", () => {
  it("registers, normalizes email and rejects duplicates and weak passwords", async () => {
    const u = await registerUser({ email: "  Dana@Example.com ", name: "דנה", password: PASSWORD });
    expect(u.email).toBe("dana@example.com");
    await expect(registerUser({ email: "dana@example.com", name: "x", password: PASSWORD })).rejects.toThrow(/כבר קיים/);
    await expect(registerUser({ email: "x@example.com", name: "x", password: "short" })).rejects.toThrow(/לפחות/);
    await expect(registerUser({ email: "not-an-email", name: "x", password: PASSWORD })).rejects.toThrow(/אימייל/);
  });

  it("authenticates with a generic error and locks after repeated failures", async () => {
    await registerUser({ email: "lock@example.com", name: "x", password: PASSWORD });
    expect((await authenticate("LOCK@example.com", PASSWORD)).email).toBe("lock@example.com");
    await expect(authenticate("nobody@example.com", PASSWORD)).rejects.toThrow("אימייל או סיסמה שגויים");
    for (let i = 0; i < 5; i++) {
      await expect(authenticate("lock@example.com", "wrong password")).rejects.toThrow("אימייל או סיסמה שגויים");
    }
    // גם הסיסמה הנכונה נחסמת בזמן הנעילה
    await expect(authenticate("lock@example.com", PASSWORD)).rejects.toThrow(/יותר מדי/);
  });
});

describe("sessions", () => {
  it("creates, validates and deletes sessions", async () => {
    const u = await registerUser({ email: "session@example.com", name: "x", password: PASSWORD });
    const { token } = await createSession(u.id);
    const s = await validateSession(token);
    expect(s?.user.id).toBe(u.id);
    expect(await validateSession("not-a-real-token")).toBeNull();
    await deleteSession(token);
    expect(await validateSession(token)).toBeNull();
  });
});

describe("memberships", () => {
  it("makes the creator owner, lets owners manage members and keeps tenants apart", async () => {
    const owner = await registerUser({ email: "owner@example.com", name: "בעלים", password: PASSWORD });
    const cpa = await registerUser({ email: "cpa@example.com", name: "רו\"ח", password: PASSWORD });
    const stranger = await registerUser({ email: "stranger@example.com", name: "זר", password: PASSWORD });
    const org = await createOrganization({
      ownerUserId: owner.id,
      name: "עסק",
      taxId: "123456782",
    });

    expect(await getRole(owner.id, org.id)).toBe("owner");
    expect(await getRole(stranger.id, org.id)).toBeNull();
    expect(await listOrganizationsForUser(stranger.id)).toHaveLength(0);

    await addMember(owner.id, org.id, "CPA@example.com", "accountant");
    expect(await getRole(cpa.id, org.id)).toBe("accountant");
    await expect(addMember(owner.id, org.id, "cpa@example.com", "viewer")).rejects.toThrow(/כבר חבר/);
    await expect(addMember(owner.id, org.id, "ghost@example.com", "viewer")).rejects.toThrow(/לא נמצא/);

    // רואה החשבון לא יכול לנהל משתמשים, וזר בוודאי שלא
    await expect(addMember(cpa.id, org.id, "stranger@example.com", "viewer")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addMember(stranger.id, org.id, "stranger@example.com", "owner")).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    await expect(removeMember(owner.id, org.id, owner.id)).rejects.toThrow(/הבעלים האחרון/);
    await removeMember(owner.id, org.id, cpa.id);
    expect(await getRole(cpa.id, org.id)).toBeNull();
  });

  it("stores the active organization on the session", async () => {
    const u = await registerUser({ email: "active@example.com", name: "x", password: PASSWORD });
    const org = await createOrganization({ ownerUserId: u.id, name: "a", taxId: "123456782" });
    const { token } = await createSession(u.id);
    await setActiveOrganization(token, org.id);
    expect((await validateSession(token))?.session.activeOrganizationId).toBe(org.id);
  });
});

describe("password reset", () => {
  it("resets once, logs out everywhere and unlocks the account", async () => {
    const u = await registerUser({ email: "reset@example.com", name: "x", password: PASSWORD });
    const { token: sessionToken } = await createSession(u.id);
    for (let i = 0; i < 5; i++) await authenticate("reset@example.com", "wrong password").catch(() => {});

    expect(await createPasswordReset("nobody@example.com")).toBeNull();
    const reset = await createPasswordReset("RESET@example.com");
    expect(reset?.user.id).toBe(u.id);

    await expect(resetPassword(reset!.token, "short")).rejects.toThrow(/לפחות/);
    await resetPassword(reset!.token, "a brand new password");
    await expect(resetPassword(reset!.token, "another new password")).rejects.toThrow(/פג תוקפו/);

    expect(await validateSession(sessionToken)).toBeNull();
    expect((await authenticate("reset@example.com", "a brand new password")).id).toBe(u.id);
    await expect(authenticate("reset@example.com", PASSWORD)).rejects.toThrow("אימייל או סיסמה שגויים");
  });

  it("limits reset requests per hour", async () => {
    await registerUser({ email: "flood@example.com", name: "x", password: PASSWORD });
    for (let i = 0; i < 3; i++) expect(await createPasswordReset("flood@example.com")).not.toBeNull();
    expect(await createPasswordReset("flood@example.com")).toBeNull();
  });
});
