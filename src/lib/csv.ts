/** CSV שנפתח נכון באקסל בעברית: BOM של UTF-8, ושדות במרכאות כשצריך */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // מניעת הזרקת נוסחאות באקסל (שדה שמתחיל ב־= + - @)
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** סכום באגורות כמספר עשרוני רגיל לאקסל (בלי סימן ₪ ובלי פסיקים) */
export const csvMoney = (agorot: number) => (agorot / 100).toFixed(2);
