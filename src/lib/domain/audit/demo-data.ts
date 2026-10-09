/**
 * נתונים מדומים לתיק ביקורת לדוגמה: ספרים לשנה ולשנה הקודמת, ריכוז תלושים ופירוט העברות שכר.
 * כל הנתונים בדויים. בתוכם "נשתלו" מקרים שהבדיקות אמורות למצוא, כדי להראות מה המערכת עושה:
 * - יוסי: שכרו לא עודכן כשעלה שכר המינימום באפריל, וחשבון הבנק שלו משותף עם בני.
 * - גיל: סיים ביוני, וקיבל העברות גם באוגוסט ובספטמבר ("עובד רפאים").
 * - דנה: ותיקה בלי הפקדות לפיצויים, ושכר ספטמבר שלה לא הועבר.
 * - בני: חצי משרה, הפקדה חלקית לפיצויים, יתרת חופשה שלילית, ובמאי הועבר לו יותר מהנטו.
 * - בספרים: פקודה בשבת, סכומים עגולים בסוף השנה, פקודה בלי תיאור, ושכר דירה שעלה ב־50% מול השנה הקודמת.
 */

interface DemoEmployee {
  id: string;
  name: string;
  start: string;
  end?: string;
  jobPct: number;
  base: number;
  /** שיעור הפקדה לפיצויים מתוך השכר */
  severance: number;
  /** חודש ותשלום דמי הבראה */
  recuperation?: [month: number, amount: number];
  /** יתרת חופשה בדצמבר */
  vacationDec: number;
  bank: string;
}

const EMPLOYEES: DemoEmployee[] = [
  { id: "000000018", name: "אורית כהן", start: "01/03/2015", jobPct: 100, base: 14000, severance: 0.0833, recuperation: [7, 3344], vacationDec: 10, bank: "12-345-600018" },
  { id: "000000026", name: "בני לוי", start: "01/07/2024", jobPct: 50, base: 4000, severance: 0.06, vacationDec: -2, bank: "10-800-111111" },
  { id: "000000034", name: "גיל מזרחי", start: "01/01/2020", end: "30/06/2025", jobPct: 100, base: 9000, severance: 0.0833, vacationDec: 0, bank: "12-345-600034" },
  { id: "000000042", name: "דנה פרץ", start: "01/02/2019", jobPct: 100, base: 16000, severance: 0, recuperation: [6, 2508], vacationDec: 22, bank: "20-100-600042" },
  { id: "000000059", name: "יוסי אברהם", start: "01/05/2022", jobPct: 100, base: 5800, severance: 0.0833, recuperation: [7, 2926], vacationDec: 6, bank: "10-800-111111" },
];

const YEAR = 2025;
const two = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toFixed(2);
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");

interface Slip {
  e: DemoEmployee;
  month: number;
  gross: number;
  tax: number;
  pensionEmployee: number;
  net: number;
}

function slips(): Slip[] {
  const out: Slip[] = [];
  for (const e of EMPLOYEES) {
    const last = e.end ? Number(e.end.slice(3, 5)) : 12;
    for (let m = 1; m <= last; m++) {
      const recup = e.recuperation && e.recuperation[0] === m ? e.recuperation[1] : 0;
      const gross = e.base + recup;
      const tax = Math.round(gross * 0.08 * 100) / 100;
      const pensionEmployee = Math.round(e.base * 0.06 * 100) / 100;
      out.push({ e, month: m, gross, tax, pensionEmployee, net: Math.round((gross - tax - pensionEmployee) * 100) / 100 });
    }
  }
  return out;
}

export function demoPayslipsCsv(): string {
  const rows: (string | number)[][] = [
    ["ת.ז.", "שם", "חודש", "תאריך תחילה", "תאריך סיום", "אחוז משרה", "שכר יסוד", "ברוטו", "מס הכנסה", "פנסיה - עובד", "פנסיה - מעסיק", "פיצויים", "דמי הבראה", "נטו", "יתרת חופשה", "חשבון בנק"],
  ];
  for (const s of slips()) {
    const { e, month: m } = s;
    rows.push([
      e.id, e.name, `${two(m)}/${YEAR}`, e.start, e.end ?? "", e.jobPct, fmt(e.base), fmt(s.gross), fmt(s.tax), fmt(s.pensionEmployee),
      fmt(e.base * 0.065), fmt(e.base * e.severance), fmt(s.gross - e.base), fmt(s.net), m === 12 ? e.vacationDec : 5, e.bank,
    ]);
  }
  return csv(rows);
}

export function demoPaymentsCsv(): string {
  const rows: (string | number)[][] = [["שם המוטב", "ת.ז.", "חשבון", "סכום", "תאריך ערך"]];
  const pay = (s: { e: DemoEmployee }, amount: number, month: number) => {
    const y = month === 13 ? YEAR + 1 : YEAR;
    rows.push([s.e.name, s.e.id, s.e.bank, fmt(amount), `05/${two(month === 13 ? 1 : month)}/${y}`]);
  };
  for (const s of slips()) {
    if (s.e.id === "000000042" && s.month === 9) continue; // דנה — ספטמבר לא הועבר
    const extra = s.e.id === "000000026" && s.month === 5 ? 1000 : 0; // בני — עודף במאי
    pay(s, s.net + extra, s.month + 1);
  }
  const gil = EMPLOYEES.find((e) => e.id === "000000034")!;
  const gilNet = slips().find((s) => s.e === gil)!.net;
  pay({ e: gil }, gilNet, 8); // אחרי שעזב
  pay({ e: gil }, gilNet, 9);
  return csv(rows);
}

/** כרטסת: מכירות, מע"מ, שכר דירה, שכר, והפרשות סוף שנה */
export function demoLedgerCsv(year: number): string {
  const current = year === YEAR;
  const rows: (string | number)[][] = [["תאריך", "מספר פקודה", "חשבון", "שם חשבון", "חובה", "זכות", "פרטים"]];
  let n = 0;
  const entry = (date: string, lines: [code: string, name: string, debit: number, credit: number][], text: string) => {
    n++;
    for (const [code, name, d, c] of lines) rows.push([date, n, code, name, d ? fmt(d) : "0", c ? fmt(c) : "0", text]);
  };
  const salaryTotal = (m: number) => slips().filter((s) => s.month === m).reduce((t, s) => t + s.gross, 0);
  for (let m = 1; m <= 12; m++) {
    const sales = current ? 120_000 + m * 3_150 + (m === 12 ? 140_000 : 0) : 100_000 + m * 2_000;
    const vat = Math.round(sales * 0.18 * 100) / 100;
    entry(`10/${two(m)}/${year}`, [["1100", "בנק", sales + vat, 0], ["3000", "הכנסות ממכירות", 0, sales], ["2200", "מע\"מ עסקאות", 0, vat]], "מכירות החודש");
    const rent = current ? 12_000 : 8_000;
    entry(`01/${two(m)}/${year}`, [["6100", "שכר דירה", rent, 0], ["1100", "בנק", 0, rent]], "שכר דירה");
    const wages = current ? salaryTotal(m) : 45_000;
    entry(`28/${two(m)}/${year}`, [["6000", "הוצאות שכר", wages, 0], ["1100", "בנק", 0, wages]], "שכר החודש");
  }
  if (current) {
    entry(`28/06/${year}`, [["6200", "הוצאות שונות", 25_000, 0], ["1100", "בנק", 0, 25_000]], "תשלום ליועץ"); // שבת, סכום עגול
    entry(`15/09/${year}`, [["6200", "הוצאות שונות", 3_480, 0], ["1100", "בנק", 0, 3_480]], ""); // בלי תיאור
    entry(`31/12/${year}`, [["6000", "הוצאות שכר", 9_000, 0], ["2140", "הפרשה לחופשה והבראה", 0, 9_000]], "הפרשה לחופשה");
    entry(`31/12/${year}`, [["6000", "הוצאות שכר", 20_000, 0], ["2900", "התחייבות בשל סיום יחסי עובד מעביד נטו", 0, 20_000]], "הפרשה לפיצויים");
  }
  return csv(rows);
}

export const DEMO_YEAR = YEAR;
