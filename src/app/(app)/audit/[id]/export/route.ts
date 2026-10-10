import { getContext } from "@/lib/auth/dal";
import { findingsCsv } from "@/lib/domain/audit/export";
import { AREA_LABELS, loadEngagementOverview } from "../overview";

export const dynamic = "force-dynamic";

// RFC 5987: גם ' ( ) * חייבים קידוד, אחרת דפדפנים מתעלמים מהשם
const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** ייצוא כל הממצאים בתיק לאקסל (CSV), כולל ההסברים שתועדו */
export async function GET(_req: Request, ctx: RouteContext<"/audit/[id]/export">) {
  const { id } = await ctx.params;
  const { org } = await getContext();
  const ov = await loadEngagementOverview(org.id, id);
  if (!ov) return new Response("לא נמצא", { status: 404 });
  const csv = findingsCsv(ov.findings, ov.notes, AREA_LABELS);
  const name = `ממצאים-${ov.engagement.clientName}-${ov.engagement.fiscalYear}.csv`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="findings-${ov.engagement.fiscalYear}.csv"; filename*=UTF-8''${rfc5987(name)}`,
      "cache-control": "no-store",
    },
  });
}
