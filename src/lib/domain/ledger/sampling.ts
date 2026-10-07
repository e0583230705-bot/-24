import type { Agorot } from "../money";

/**
 * דגימה כספית (Monetary Unit Sampling): לכל שקל סיכוי שווה להיבחר, ולכן פריטים גדולים נבחרים יותר,
 * וכל פריט שגדול ממרווח הדגימה נבחר תמיד. נקודת ההתחלה נגזרת מ־seed — כדי שאפשר יהיה לשחזר את המדגם בתיק.
 */
export interface SampleItem {
  id: string;
  amount: Agorot;
}

/** מחולל מספרים פסאודו־אקראי דטרמיניסטי (mulberry32) */
function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function monetaryUnitSample(items: SampleItem[], sampleSize: number, seed: number) {
  const population = items.filter((i) => i.amount !== 0).map((i) => ({ ...i, abs: Math.abs(i.amount) }));
  const total = population.reduce((s, i) => s + i.abs, 0);
  if (sampleSize <= 0 || total === 0) return { interval: 0, start: 0, selected: [] as (SampleItem & { reason: "key" | "sampled" })[] };

  const interval = total / sampleSize;
  const start = seededRandom(seed)() * interval;
  const selected: (SampleItem & { reason: "key" | "sampled" })[] = [];
  let cumulative = 0;
  let next = start;
  for (const item of population) {
    const from = cumulative;
    cumulative += item.abs;
    if (item.abs >= interval) {
      selected.push({ id: item.id, amount: item.amount, reason: "key" });
      while (next < cumulative) next += interval;
      continue;
    }
    if (next >= from && next < cumulative) {
      selected.push({ id: item.id, amount: item.amount, reason: "sampled" });
      while (next < cumulative) next += interval;
    }
  }
  return { interval: Math.round(interval), start: Math.round(start), selected };
}
