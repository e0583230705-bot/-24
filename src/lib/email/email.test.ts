import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { EmailError, sendEmail } from "./send";
import { passwordResetEmail } from "./templates";

const msg = { to: "customer@example.com", subject: "חשבונית", html: "<p>x</p>", text: "x" };

async function logFor(to: string) {
  const db = await getDb();
  return db.select().from(schema.emailLog).where(eq(schema.emailLog.to, to));
}

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("simulates and logs when no provider is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail({ ...msg, to: "sim@example.com" })).toEqual({ status: "simulated" });
    expect((await logFor("sim@example.com"))[0].status).toBe("simulated");
  });

  it("sends through Resend with attachments and logs the provider id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "billing@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      ...msg,
      to: "real@example.com",
      attachments: [{ filename: "a.pdf", content: new Uint8Array([37, 80, 68, 70]) }],
    });
    expect(result).toEqual({ status: "sent", providerId: "email_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "billing@example.com", to: ["real@example.com"], subject: "חשבונית" });
    expect(body.attachments).toEqual([{ filename: "a.pdf", content: "JVBERg==" }]);
    expect((await logFor("real@example.com"))[0]).toMatchObject({ status: "sent", providerId: "email_123" });
  });

  it("logs failures and raises a readable error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "billing@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    await expect(sendEmail({ ...msg, to: "fail@example.com" })).rejects.toBeInstanceOf(EmailError);
    expect((await logFor("fail@example.com"))[0]).toMatchObject({ status: "failed", error: "domain not verified" });
  });
});

describe("email templates", () => {
  it("builds a password reset email with the link", () => {
    const m = passwordResetEmail({ name: "דנה", link: "https://x.test/reset?token=abc" });
    expect(m.html).toContain("https://x.test/reset?token=abc");
    expect(m.subject.length).toBeGreaterThan(0);
  });
});
