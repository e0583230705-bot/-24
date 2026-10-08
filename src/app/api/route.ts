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
    const e = err as { code?: string; message?: string };
    return Response.json({ ok: false, code: e.code ?? null, error: (e.message ?? String(err)).replace(/postgres(ql)?:\/\/\S+/g, "[url]") }, { status: 503 });
  }
}
