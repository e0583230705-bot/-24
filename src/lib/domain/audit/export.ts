import { toCsv } from "../../csv";
import type { EngagementFinding, WorkpaperArea } from "./findings";

const SEVERITY: Record<EngagementFinding["severity"], string> = { error: "שגיאה", warning: "לבדיקה", info: "לידיעה" };

type Note = { text: string; author: string | null; updatedAt: Date };

/** כל הממצאים בתיק לאקסל: תחום, חומרה, סוג, ממצא, וההסבר שתועד בתיק (אם יש) */
export function findingsCsv(findings: EngagementFinding[], notes: Map<string, Note>, areaLabels: Record<WorkpaperArea, string>): string {
  const rows: (string | number | null)[][] = [["תחום", "חומרה", "סוג הממצא", "ממצא", "הסבר בתיק", "הוסבר על ידי", "תאריך ההסבר"]];
  const order: EngagementFinding["severity"][] = ["error", "warning", "info"];
  const sorted = [...findings].sort((a, b) => a.area.localeCompare(b.area) || order.indexOf(a.severity) - order.indexOf(b.severity));
  for (const f of sorted) {
    const n = notes.get(f.key);
    rows.push([
      areaLabels[f.area],
      SEVERITY[f.severity],
      f.label,
      f.message,
      n?.text ?? "",
      n?.author ?? "",
      n ? n.updatedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "",
    ]);
  }
  return toCsv(rows);
}
