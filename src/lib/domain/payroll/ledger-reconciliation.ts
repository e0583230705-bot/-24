import type { Agorot } from "../money";
import type { LedgerAccount, LedgerLine } from "../ledger/types";
import type { PayrollFile } from "./types";
import { summarizePayroll } from "./checks";

/**
 * התאמת נתוני השכר (קובץ 126 / 102) לספרי הנהלת החשבונות.
 * זו הבדיקה שכל משרד עושה ידנית בסוף שנה: האם מה שדווח לרשויות הוא מה שנרשם בספרים.
 *
 * כל סכום שכר מושווה לקבוצת חשבונות בספרים. הקבוצות מזוהות אוטומטית לפי שמות החשבונות,
 * ורואה החשבון יכול לתקן את המיפוי. ההשוואה:
 * - חשבונות הוצאה: תנועת החובה נטו בשנה (= ההוצאה שנרשמה)
 * - חשבונות התחייבות (מוסדות): תנועת הזכות בשנה (= מה שנזקף לתשלום), והיתרה בסוף השנה מול חוב חודש אחד
 */

export type PayrollAccountGroup =
  | "salaryExpense"
  | "niEmployerExpense"
  | "socialExpense"
  | "incomeTaxPayable"
  | "niPayable"
  | "fundsPayable"
  | "netWagesPayable"
  | "vacationProvision"
  | "severanceLiability";

export type PayrollAccountMap = Record<PayrollAccountGroup, string[]>;

export const PAYROLL_GROUPS: Record<PayrollAccountGroup, { label: string; kind: "expense" | "liability"; hint: string }> = {
  salaryExpense: { label: "הוצאות שכר (ברוטו)", kind: "expense", hint: "משכורות, שכר עבודה, שכר הנהלה" },
  niEmployerExpense: { label: "ביטוח לאומי מעסיק", kind: "expense", hint: "חלק המעסיק בדמי הביטוח" },
  socialExpense: { label: "הפרשות סוציאליות", kind: "expense", hint: "פנסיה, פיצויים, קרן השתלמות — חלק מעסיק" },
  incomeTaxPayable: { label: "מס הכנסה ניכויים", kind: "liability", hint: "מס שנוכה מהעובדים ומועבר ב־102" },
  niPayable: { label: "ביטוח לאומי לשלם", kind: "liability", hint: "עובד + מעסיק + בריאות" },
  fundsPayable: { label: "קופות גמל / פנסיה לשלם", kind: "liability", hint: "עובד + מעסיק" },
  netWagesPayable: { label: "עובדים — נטו לתשלום", kind: "liability", hint: "משכורות לשלם" },
  vacationProvision: { label: "הפרשה לחופשה והבראה", kind: "liability", hint: "" },
  severanceLiability: { label: "התחייבות לפיצויים (נטו)", kind: "liability", hint: "עתודה בניכוי יעודה" },
};

const clean = (s: string) => s.replace(/["״׳'\-–_.]/g, " ").replace(/\s+/g, " ").trim();

/** הצעה אוטומטית למיפוי לפי שמות החשבונות. הסדר חשוב: ההתחייבויות נבדקות לפני ההוצאות */
export function suggestPayrollAccounts(accounts: LedgerAccount[]): PayrollAccountMap {
  const map: PayrollAccountMap = {
    salaryExpense: [], niEmployerExpense: [], socialExpense: [], incomeTaxPayable: [], niPayable: [],
    fundsPayable: [], netWagesPayable: [], vacationProvision: [], severanceLiability: [],
  };
  for (const a of accounts) {
    const n = clean(a.name);
    const isPayable = /לשלם|זכאים|מוסדות|ניכויים|התחייבות|עתודה|הפרשה ל/.test(n);
    if (/מס הכנסה/.test(n) && /ניכוי|שכר|עובדים|לשלם/.test(n)) map.incomeTaxPayable.push(a.code);
    else if (/חופשה|הבראה/.test(n) && /הפרשה|התחייבות|עתודה/.test(n)) map.vacationProvision.push(a.code);
    else if (/פיצויים|סיום יחסי|עובד מעביד/.test(n) && /התחייבות|עתודה|נטו|בשל/.test(n)) map.severanceLiability.push(a.code);
    else if (/(ביטוח לאומי|ב ל|בטוח לאומי|ביטוח לאומי)/.test(n) && (isPayable || /עובד|ניכוי/.test(n)) && !/מעביד|מעסיק/.test(n)) map.niPayable.push(a.code);
    else if (/(ביטוח לאומי|בטוח לאומי|ב ל)/.test(n) && /מעביד|מעסיק|הוצאות/.test(n)) map.niEmployerExpense.push(a.code);
    else if (/(גמל|פנסיה|השתלמות|קופות|מבטחים|ביטוח מנהלים|סוציאלי|פיצויים)/.test(n) && isPayable) map.fundsPayable.push(a.code);
    else if (/(גמל|פנסיה|השתלמות|קופות|סוציאלי|פיצויים|ביטוח מנהלים)/.test(n)) map.socialExpense.push(a.code);
    else if (/(עובדים|משכורות|שכר)/.test(n) && /נטו|לשלם|זכאים/.test(n)) map.netWagesPayable.push(a.code);
    else if (/(שכר|משכורת|משכורות|שכ"ע|שכר עבודה)/.test(n) && !/מס שכר|היטל/.test(n)) map.salaryExpense.push(a.code);
  }
  return map;
}

export interface AccountMovement {
  code: string;
  name: string;
  debits: Agorot;
  credits: Agorot;
  /** יתרה בסוף השנה: חיובי = חובה */
  closing: Agorot;
}

export function accountMovements(accounts: LedgerAccount[], lines: LedgerLine[], from: string, to: string): Map<string, AccountMovement> {
  const map = new Map<string, AccountMovement>();
  for (const a of accounts) map.set(a.code, { code: a.code, name: a.name, debits: 0, credits: 0, closing: a.openingBalance });
  for (const l of lines) {
    const m = map.get(l.accountCode);
    if (!m) continue;
    if (l.date >= from && l.date <= to) {
      if (l.amount >= 0) m.debits += l.amount;
      else m.credits -= l.amount;
      m.closing += l.amount;
    }
  }
  return map;
}

export interface PayrollReconRow {
  group: PayrollAccountGroup;
  label: string;
  /** הסכום לפי דוחות השכר (126 / 102) */
  payroll: Agorot | null;
  /** מה נרשם בספרים (תנועה בשנה) */
  books: Agorot | null;
  diff: Agorot | null;
  /** יתרת סוף שנה בחשבונות ההתחייבות, מול החוב הצפוי (דצמבר) */
  closing?: Agorot;
  expectedClosing?: Agorot | null;
  accounts: string[];
  status: "ok" | "diff" | "unmapped" | "na";
  note: string;
}

export function reconcilePayrollToLedger(
  file: PayrollFile,
  accounts: LedgerAccount[],
  lines: LedgerLine[],
  mapping: PayrollAccountMap,
  opts: { from: string; to: string; tolerance: Agorot },
): PayrollReconRow[] {
  const s = summarizePayroll(file);
  const mv = accountMovements(accounts, lines, opts.from, opts.to);
  const sumBy = (codes: string[], f: (m: AccountMovement) => Agorot) => codes.reduce((t, c) => t + (mv.get(c) ? f(mv.get(c)!) : 0), 0);
  const december = [...file.months].sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;

  const row = (
    group: PayrollAccountGroup,
    payroll: Agorot | null,
    booksOf: (codes: string[]) => Agorot,
    extra: Partial<PayrollReconRow> = {},
  ): PayrollReconRow => {
    const codes = mapping[group] ?? [];
    const label = PAYROLL_GROUPS[group].label;
    if (payroll === null) return { group, label, payroll, books: null, diff: null, accounts: codes, status: "na", note: "אין נתון בקובץ השכר", ...extra };
    if (codes.length === 0) return { group, label, payroll, books: null, diff: null, accounts: codes, status: "unmapped", note: "לא נבחרו חשבונות בספרים", ...extra };
    const books = booksOf(codes);
    const diff = books - payroll;
    const ok = Math.abs(diff) <= opts.tolerance;
    return { group, label, payroll, books, diff, accounts: codes, status: ok ? "ok" : "diff", ...extra, note: ok ? "" : (extra.note ?? "") };
  };

  const expense = (codes: string[]) => sumBy(codes, (m) => m.debits - m.credits);
  const credited = (codes: string[]) => sumBy(codes, (m) => m.credits);
  const closing = (codes: string[]) => -sumBy(codes, (m) => m.closing);

  const rows: PayrollReconRow[] = [
    row("salaryExpense", s.gross, expense, {
      note: "הפרש אפשרי: שווי הטבות שלא דרך הנה״ח, הפרשות חופשה/הבראה/בונוס, היוון שכר, פיצויים ששולמו דרך קופה",
    }),
    row("niEmployerExpense", s.niEmployer, expense, { note: "חלק המעסיק = סך דמי הביטוח ב־102 פחות הניכוי מהעובדים" }),
    row("socialExpense", s.pensionEmployer + s.severanceEmployer + s.studyFundEmployer, expense, {
      note: "הפרש אפשרי: עובדים ללא סעיף 14 (שינוי בהתחייבות), אובדן כושר עבודה, הפקדות מעבר לתקרה",
    }),
    row("incomeTaxPayable", s.taxWithheld, credited, {
      closing: closing(mapping.incomeTaxPayable ?? []),
      expectedClosing: december ? december.taxWithheld : null,
      note: "תנועת הזכות בשנה צריכה להיות המס שנוכה; היתרה בסוף השנה — המס של דצמבר בלבד (משולם עד 15.1)",
    }),
    row("niPayable", file.months.reduce((t, m) => t + m.niTotal, 0) || null, credited, {
      closing: closing(mapping.niPayable ?? []),
      expectedClosing: december ? december.niTotal : null,
      note: "עובד + מעסיק + בריאות; היתרה בסוף השנה — דמי הביטוח של דצמבר בלבד",
    }),
  ];
  // קבוצות שרק מציגים להן יתרה (אין להן סכום ישיר ב־126)
  for (const g of ["fundsPayable", "netWagesPayable", "vacationProvision", "severanceLiability"] as const) {
    const codes = mapping[g] ?? [];
    rows.push({
      group: g,
      label: PAYROLL_GROUPS[g].label,
      payroll: null,
      books: codes.length ? credited(codes) : null,
      diff: null,
      closing: codes.length ? closing(codes) : undefined,
      accounts: codes,
      status: codes.length ? "na" : "unmapped",
      note:
        g === "netWagesPayable"
          ? "היתרה בסוף השנה צריכה להיות שכר הנטו של דצמבר (משולם בינואר)"
          : g === "fundsPayable"
            ? "היתרה בסוף השנה צריכה להיות ההפקדה של דצמבר (עד 15.1); יתרה גדולה יותר = פיגור בהפקדות"
            : g === "vacationProvision"
              ? "לבדוק מול דוח צבירת חופשה ליום המאזן × ערך יום"
              : "לעובדים ללא סעיף 14: שכר אחרון × שנות ותק, בניכוי יעודה",
    });
  }
  return rows;
}
