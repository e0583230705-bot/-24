import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** בדיקת חיות: האם האפליקציה מצליחה לדבר עם מסד הנתונים. מחזיר רק סוג שגיאה, בלי פרטי חיבור. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    // Drizzle עוטף את שגיאת הדרייבר ב־cause — שם נמצא המידע המועיל
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const c = e.cause ?? e;
    const clean = (m?: string) => (m ?? "").replace(/postgres(ql)?:\/\/\S+/g, "[url]");
    return Response.json({ ok: false, code: c.code ?? e.code ?? null, error: clean(c.message) || clean(e.message) || String(err) }, { status: 503 });
  }
}
