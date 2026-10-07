import "server-only";
import { getDb, schema } from "@/db";

/**
 * שליחת מיילים. כשמוגדר RESEND_API_KEY המייל נשלח באמת דרך Resend;
 * אחרת הוא "מסומלץ": נרשם ביומן ומודפס ללוג השרת, כדי שאפשר יהיה לפתח ולבדוק בלי ספק.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array }[];
  /** לתיעוד ביומן */
  organizationId?: string;
  documentId?: string;
}

export type EmailResult = { status: "sent"; providerId: string } | { status: "simulated" };

export class EmailError extends Error {}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appUrl(path = "") {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

async function sendWithResend(msg: EmailMessage): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
      })),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new EmailError(body.message ?? `שליחת המייל נכשלה (${res.status})`);
  return body.id;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const db = await getDb();
  const log = (status: string, extra: { providerId?: string; error?: string } = {}) =>
    db.insert(schema.emailLog).values({
      organizationId: msg.organizationId ?? null,
      documentId: msg.documentId ?? null,
      to: msg.to,
      subject: msg.subject,
      status,
      providerId: extra.providerId ?? null,
      error: extra.error ?? null,
    });

  if (!emailConfigured()) {
    await log("simulated");
    console.info(`[email:simulated] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { status: "simulated" };
  }
  try {
    const providerId = await sendWithResend(msg);
    await log("sent", { providerId });
    return { status: "sent", providerId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await log("failed", { error });
    throw e instanceof EmailError ? e : new EmailError("שליחת המייל נכשלה");
  }
}
