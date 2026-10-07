import type { Agorot } from "../money";

/**
 * מהותיות: הסכום שמעליו טעות עלולה להשפיע על החלטות של קורא הדוחות.
 * הבסיס והאחוז הם שיקול דעת מקצועי של רואה החשבון — כאן רק ברירות מחדל מקובלות.
 */
export type MaterialityBasis = "profit_before_tax" | "revenue" | "total_assets" | "equity";

export const MATERIALITY_BASES: Record<MaterialityBasis, { label: string; defaultPct: number }> = {
  profit_before_tax: { label: "רווח לפני מס", defaultPct: 5 },
  revenue: { label: "הכנסות", defaultPct: 1 },
  total_assets: { label: "סך נכסים", defaultPct: 1 },
  equity: { label: "הון עצמי", defaultPct: 2 },
};

export function computeMateriality(base: Agorot, pct: number, performancePct = 75) {
  const overall = Math.round((Math.abs(base) * pct) / 100);
  return {
    overall,
    /** מהותיות לביצוע — נמוכה מהכוללת, כדי שסך הטעויות הלא מאותרות יישאר מתחת לכוללת */
    performance: Math.round((overall * performancePct) / 100),
    /** "טעות זניחה בעליל" — מתחת לזה לא צוברים טעויות */
    trivial: Math.round(overall * 0.05),
  };
}
