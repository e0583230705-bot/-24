import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashBackupCode,
  newBackupCodes,
  newTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "./totp";

// וקטורי הבדיקה הרשמיים של RFC 6238 (נספח B), SHA1, הסוד "12345678901234567890", 8 ספרות → 6 הספרות האחרונות
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe("287082");
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe("005924");
    expect(totpCode(RFC_SECRET, 2_000_000_000_000)).toBe("279037");
  });

  it("round-trips base32 and creates 160-bit secrets", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255, 7]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
  });

  it("accepts the current code and one step of clock drift, nothing else", () => {
    const s = newTotpSecret();
    const now = 1_800_000_000_000;
    expect(verifyTotp(s, totpCode(s, now), now)).toBe(true);
    expect(verifyTotp(s, totpCode(s, now - 30_000), now)).toBe(true);
    expect(verifyTotp(s, totpCode(s, now + 30_000), now)).toBe(true);
    expect(verifyTotp(s, totpCode(s, now - 90_000), now)).toBe(false);
    expect(verifyTotp(s, "12345", now)).toBe(false);
    expect(verifyTotp(s, `${totpCode(s, now).slice(0, 3)} ${totpCode(s, now).slice(3)}`, now)).toBe(true);
  });

  it("builds an otpauth URL for the authenticator app", () => {
    expect(otpauthUrl("ABC", "a@b.co")).toMatch(/^otpauth:\/\/totp\/.+\?secret=ABC&issuer=.+&digits=6&period=30$/);
  });

  it("encrypts the stored secret and detects tampering", () => {
    const s = newTotpSecret();
    const enc = encryptSecret(s);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
    expect(encryptSecret(s)).not.toBe(enc);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("creates distinct backup codes and hashes them insensitive to case and dashes", () => {
    const codes = newBackupCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashBackupCode(codes[0].toUpperCase().replace("-", " "))).toBe(hashBackupCode(codes[0]));
  });
});
