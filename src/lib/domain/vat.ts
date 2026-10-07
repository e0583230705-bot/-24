import { type Agorot } from "./money";

/**
 * היסטוריית שיעורי מע"מ בישראל. יש לעדכן כאן כשהשיעור משתנה.
 * מקור: רשות המסים. לבדוק מחדש מול המקור הרשמי לפני כל שינוי.
 */
export const VAT_RATE_HISTORY: { from: string; rate: number }[] = [
  { from: "2015-10-01", rate: 17 },
  { from: "2025-01-01", rate: 18 },
];

/** תאריך בפורמט YYYY-MM-DD */
export type ISODate = string;

export function vatRateOn(date: ISODate): number {
  let rate = VAT_RATE_HISTORY[0].rate;
  for (const entry of VAT_RATE_HISTORY) {
    if (date >= entry.from) rate = entry.rate;
  }
  return rate;
}

export interface VatBreakdown {
  net: Agorot;
  vat: Agorot;
  gross: Agorot;
  rate: number;
}

/** מחשב מע"מ על סכום לפני מע"מ. */
export function addVat(net: Agorot, rate: number): VatBreakdown {
  const vat = Math.round((net * rate) / 100);
  return { net, vat, gross: net + vat, rate };
}

/** מפרק סכום כולל מע"מ (למשל מקבלה) לסכום נטו ולמע"מ. */
export function splitGross(gross: Agorot, rate: number): VatBreakdown {
  const net = Math.round((gross * 100) / (100 + rate));
  return { net, vat: gross - net, gross, rate };
}
