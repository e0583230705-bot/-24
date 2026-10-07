/** בניית קבצי מבנה אחיד לבדיקות, לפי עמודות המפרט (הוראות 1.31) */
/** בונה רשומה באורך קבוע לפי עמודות המפרט: מספרי מיושר לימין עם אפסים, אלפאנומרי לשמאל עם רווחים */
export function record(length: number, fields: [from: number, to: number, value: string | number, kind?: "n" | "x"][]) {
  const chars = Array(length).fill(" ");
  for (const [from, to, value, kind = typeof value === "number" ? "n" : "x"] of fields) {
    const width = to - from + 1;
    const s = kind === "n" ? String(value).padStart(width, "0") : String(value).padEnd(width, " ");
    if (s.length !== width) throw new Error(`value too long for ${from}-${to}`);
    for (let i = 0; i < width; i++) chars[from - 1 + i] = s[i];
  }
  return chars.join("");
}
export const money = (agorot: number) => (agorot < 0 ? "-" : "+") + String(Math.abs(agorot)).padStart(14, "0");

export const OSEK = 515555555;
export const MAIN = 123456789012345;

export function b110(no: number, code: string, name: string, opening: number, debits: number, credits: number) {
  return record(376, [
    [1, 4, "B110"], [5, 13, no], [14, 22, OSEK], [23, 37, code], [38, 87, name],
    [88, 102, "TB1"], [103, 132, "קבוצה"], [278, 292, money(opening), "x"],
    [293, 307, money(debits), "x"], [308, 322, money(credits), "x"], [323, 326, 1000],
  ]);
}
export function b100(no: number, entry: number, line: number, date: string, account: string, side: 1 | 2, amount: number, details: string) {
  return record(317, [
    [1, 4, "B100"], [5, 13, no], [14, 22, OSEK], [23, 32, entry], [33, 37, line],
    [61, 80, "INV-77"], [107, 156, details], [157, 164, date], [165, 172, date],
    [173, 187, account], [203, 203, side], [207, 221, money(amount), "x"], [276, 283, date],
  ]);
}

export function buildFile({ breakNumbering = false, declared }: { breakNumbering?: boolean; declared?: number } = {}) {
  const recs = [
    record(95, [[1, 4, "A100"], [5, 13, 1], [14, 22, OSEK], [23, 37, MAIN], [38, 45, "&OF1.31&"]]),
    b110(2, "1000", "קופה", 50000, 118000, 0),
    b110(3, "4000", "הכנסות", 0, 0, 100000),
    b110(4, "2200", "מע\"מ עסקאות", 0, 0, 18000),
    b100(5, 17, 1, "20250305", "1000", 1, 118000, "מכירה במזומן"),
    b100(breakNumbering ? 9 : 6, 17, 2, "20250305", "4000", 2, 100000, "מכירה במזומן"),
    b100(breakNumbering ? 10 : 7, 17, 3, "20250305", "2200", 2, 18000, "מכירה במזומן"),
  ];
  const total = recs.length + 1;
  recs.push(record(110, [[1, 4, "Z900"], [5, 13, breakNumbering ? 11 : 8], [14, 22, OSEK], [23, 37, MAIN], [38, 45, "&OF1.31&"], [46, 60, declared ?? total]]));
  return recs.join("\r\n") + "\r\n";
}


/** קידוד Windows-1255 (כמו בקבצים אמיתיים): אותיות א–ת → 0xE0–0xFA */
export function encode1255(text: string): Uint8Array {
  return Uint8Array.from([...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 0x05d0 && c <= 0x05ea) return 0xe0 + (c - 0x05d0);
    if (c < 0x80) return c;
    throw new Error(`no 1255 mapping for ${ch}`);
  }));
}
