/**
 * כל הסכומים במערכת נשמרים באגורות כמספר שלם, כדי להימנע משגיאות עיגול של נקודה צפה.
 */
export type Agorot = number;

export function toAgorot(shekels: number): Agorot {
  return Math.round(shekels * 100);
}

export function toShekels(agorot: Agorot): number {
  return agorot / 100;
}

/** מפענח קלט משתמש כמו "1,234.50" או "₪99" לאגורות. מחזיר null לקלט לא תקין. */
export function parseShekels(input: string): Agorot | null {
  const cleaned = input.replace(/[₪,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return toAgorot(Number(cleaned));
}

const formatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
});

export function formatILS(agorot: Agorot): string {
  return formatter.format(toShekels(agorot));
}

/** מכפיל סכום באחוז ומעגל לאגורה הקרובה. */
export function applyPercent(agorot: Agorot, percent: number): Agorot {
  return Math.round((agorot * percent) / 100);
}

export function sum(values: Agorot[]): Agorot {
  return values.reduce((a, b) => a + b, 0);
}
