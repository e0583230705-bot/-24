import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * אימות דו־שלבי בקוד מתחלף (TOTP, RFC 6238) — מה שאפליקציות כמו Google Authenticator ו־Microsoft Authenticator מפיקות:
 * 6 ספרות שמתחלפות כל 30 שניות, מחושבות מסוד משותף ומהשעה.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("תו לא חוקי בסוד");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** סוד חדש: 20 בתים אקראיים (160 ביט), בקידוד base32 */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** הקוד לרגע נתון (ברירת מחדל: עכשיו) */
export function totpCode(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_S);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", Buffer.from(base32Decode(secret))).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** בדיקת קוד, עם סבילות של צעד אחד לפני ואחרי (שעון לא מסונכרן) */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  for (const delta of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secret, at + delta * STEP_S * 1000));
    if (timingSafeEqual(expected, Buffer.from(c))) return true;
  }
  return false;
}

/** הכתובת שהאפליקציה סורקת מקוד ה־QR */
export function otpauthUrl(secret: string, account: string, issuer = "ביקורת חכמה") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

/* ---------- הצפנת הסוד במסד הנתונים ---------- */

/**
 * הסוד נשמר מוצפן (AES-256-GCM), כך שדליפה של מסד הנתונים לבדה לא מאפשרת להפיק קודים.
 * המפתח: משתנה הסביבה TOTP_ENCRYPTION_KEY (32 בתים ב־base64). בפיתוח ובבדיקות יש מפתח קבוע; בייצור חובה להגדיר.
 */
function key(): Buffer {
  const env = process.env.TOTP_ENCRYPTION_KEY;
  if (env) {
    const k = Buffer.from(env, "base64");
    if (k.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY חייב להיות 32 בתים ב־base64");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("חסר TOTP_ENCRYPTION_KEY בסביבת הייצור");
  return createHash("sha256").update("dev-only-totp-key").digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("סוד שמור בפורמט לא מוכר");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/* ---------- קודי גיבוי ---------- */

/** 8 קודים חד־פעמיים, למקרה שהטלפון אבד. נשמר רק ה־hash */
export function newBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8).toLowerCase();
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export const hashBackupCode = (code: string) => createHash("sha256").update(code.trim().toLowerCase().replace(/[\s-]/g, "")).digest("hex");
