/**
 * חוק בנפורד — הספרה הראשונה בסכומים "טבעיים" מתפלגת לוגריתמית (1 מופיעה ב־30% מהמקרים, 9 ב־4.6%).
 * סטייה גדולה מרמזת על סכומים מומצאים, עיגולים שיטתיים או פיצול עסקאות.
 * ספי ההתאמה (MAD) לפי Nigrini לספרה ראשונה.
 */
export const BENFORD_EXPECTED = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

export type BenfordConformity = "close" | "acceptable" | "marginal" | "nonconformity";

export const CONFORMITY_LABELS: Record<BenfordConformity, string> = {
  close: "התאמה גבוהה",
  acceptable: "התאמה סבירה",
  marginal: "התאמה גבולית",
  nonconformity: "אין התאמה — לבדוק",
};

/** פחות מזה אין משמעות סטטיסטית לבדיקה */
export const BENFORD_MIN_SAMPLE = 300;

export function benford(amounts: number[]) {
  const counts = Array(9).fill(0) as number[];
  for (const a of amounts) {
    const abs = Math.abs(a);
    // בנפורד מתאים לסכומים מ־10 ₪ ומעלה; סכומים קטנים מעוותים את ההתפלגות
    if (abs < 10_00) continue;
    counts[Number(String(abs)[0]) - 1]++;
  }
  const n = counts.reduce((s, c) => s + c, 0);
  const observed = counts.map((c) => (n ? c / n : 0));
  const mad = n ? observed.reduce((s, o, i) => s + Math.abs(o - BENFORD_EXPECTED[i]), 0) / 9 : 0;
  const conformity: BenfordConformity =
    mad <= 0.006 ? "close" : mad <= 0.012 ? "acceptable" : mad <= 0.015 ? "marginal" : "nonconformity";
  return { n, counts, observed, expected: BENFORD_EXPECTED, mad, conformity, reliable: n >= BENFORD_MIN_SAMPLE };
}
