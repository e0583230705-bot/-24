import type { Agorot } from "../money";
import { parseBankAmount, parseBankDate } from "../bank/parse";
import { cleanHeader, parsePayslipMonth, PayslipParseError, type PayslipRow, type PayslipTable } from "./payslips";
import type { PayrollIssue } from "./types";

/**
 * תשלומי שכר בפועל — "פירוט זיכויים" של מס"ב / העברות המשכורת מהבנק, כקובץ אקסל או CSV: שורה לכל העברה לעובד.
 * המטרה: לוודא שכל שקל שיצא מהבנק כשכר הגיע לעובד שיש לו תלוש באותו חודש, בסכום הנטו שלו ולחשבון שלו
 * (בדיקות D13 ו־A במסמך המחקר — הבדיקה החזקה ביותר נגד "עובדי רפאים").
 *
 * את קובץ הזיכויים הגולמי של מס"ב (רשומות ברוחב קבוע) לא קוראים כאן: עד שיש בידינו המפרט הרשמי וקובץ אמיתי,
 * לא מנחשים מיקומי שדות. כל מערכת בנקאית מייצאת את פירוט הזיכויים לאקסל, וזה מה שנקלט.
 */

export type PaymentField = "taxId" | "name" | "bank" | "branch" | "account" | "amount" | "date" | "month" | "reference";
export type PaymentColumnMap = Partial<Record<PaymentField, number>>;

const rx = (...parts: string[]) => parts.map((p) => new RegExp(p));

export const PAYMENT_FIELDS: Record<PaymentField, { label: string; required?: boolean; match: RegExp[] }> = {
  taxId: { label: "מספר זהות", match: rx("^(ת ?ז|תעודת זהות|מספר זהות|מס זהות|זהות|ת ז מוטב|id)$", "זהות|ת ז") },
  name: { label: "שם המוטב", match: rx("^(שם|שם המוטב|שם מוטב|מוטב|שם העובד|שם עובד|שם בעל החשבון)$", "מוטב|שם") },
  bank: { label: "בנק", match: rx("^(בנק|קוד בנק|מס בנק|מספר בנק)$") },
  branch: { label: "סניף", match: rx("^(סניף|קוד סניף|מס סניף|מספר סניף)$") },
  account: { label: "חשבון (או בנק־סניף־חשבון)", match: rx("^(חשבון|מס חשבון|מספר חשבון|חשבון מוטב|חשבון בנק)$", "חשבון") },
  amount: { label: "סכום", required: true, match: rx("^(סכום|סכום זיכוי|סכום להעברה|סכום העברה|נטו|סכום ש ח)$", "סכום") },
  date: { label: "תאריך ערך / העברה", match: rx("^(תאריך|תאריך ערך|תאריך העברה|תאריך זיכוי|תאריך ביצוע)$", "תאריך") },
  month: { label: "חודש שכר", match: rx("^(חודש|חודש שכר|חודש משכורת|עבור חודש|תקופה)$") },
  reference: { label: "אסמכתא", match: rx("אסמכת|אסמכתה|מס העברה|reference") },
};

export function autoMapPaymentColumns(headers: string[]): PaymentColumnMap {
  const cleaned = headers.map(cleanHeader);
  const map: PaymentColumnMap = {};
  const used = new Set<number>();
  const order: PaymentField[] = ["taxId", "bank", "branch", "account", "month", "date", "amount", "reference", "name"];
  for (const field of order) {
    for (const pattern of PAYMENT_FIELDS[field].match) {
      const idx = cleaned.findIndex((h, i) => !used.has(i) && h !== "" && pattern.test(h));
      if (idx >= 0) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

/** חובה: סכום; וגם חודש או תאריך; וגם דרך לזהות את המוטב (ת.ז. או חשבון) */
export function missingPaymentFields(map: PaymentColumnMap): string[] {
  const out: string[] = [];
  if (map.amount === undefined) out.push(PAYMENT_FIELDS.amount.label);
  if (map.date === undefined && map.month === undefined) out.push("תאריך או חודש שכר");
  if (map.taxId === undefined && map.account === undefined) out.push("מספר זהות או חשבון");
  return out;
}

/** נרמול חשבון בנק למפתח השוואה: בנק־סניף־חשבון בלי אפסים מובילים, או ספרות בלבד אם אין הפרדה */
export function normalizeAccount(raw: string | null, bank?: string, branch?: string): string | null {
  const strip = (s: string) => s.replace(/^0+(?=\d)/, "");
  if (bank && branch && raw) {
    const acc = raw.replace(/\D/g, "");
    if (!acc) return null;
    return `${strip(bank.replace(/\D/g, ""))}-${strip(branch.replace(/\D/g, ""))}-${strip(acc)}`;
  }
  if (!raw) return null;
  const parts = raw.split(/\D+/).filter(Boolean);
  if (parts.length === 3) return parts.map(strip).join("-");
  const digits = raw.replace(/\D/g, "");
  return digits ? strip(digits) : null;
}

export interface PaymentRow {
  taxId: string | null;
  name: string;
  account: string | null;
  amount: Agorot;
  date: string | null;
  /** חודש שכר אם הופיע בקובץ */
  month: string | null;
  reference: string | null;
  line: number;
}

export function applyPaymentMapping(table: PayslipTable, map: PaymentColumnMap, hintYear?: number): { rows: PaymentRow[]; skipped: number; issues: PayrollIssue[] } {
  const missing = missingPaymentFields(map);
  if (missing.length) throw new PayslipParseError(`חסר מיפוי לעמודות חובה: ${missing.join(", ")}`);
  const get = (r: string[], f: PaymentField) => (map[f] === undefined ? "" : (r[map[f]!] ?? "").trim());
  const rows: PaymentRow[] = [];
  let skipped = 0;
  table.rows.forEach((r, i) => {
    const amount = parseBankAmount(get(r, "amount"));
    const label = get(r, "name") + get(r, "taxId");
    if (amount === null || amount === 0 || /סה.?כ|סך/.test(label)) {
      skipped++;
      return;
    }
    const idDigits = get(r, "taxId").replace(/\D/g, "");
    const date = parseBankDate(get(r, "date"));
    const month = map.month !== undefined ? parsePayslipMonth(get(r, "month"), hintYear) : null;
    const account = normalizeAccount(get(r, "account") || null, map.bank !== undefined ? get(r, "bank") : undefined, map.branch !== undefined ? get(r, "branch") : undefined);
    if (!date && !month) {
      skipped++;
      return;
    }
    rows.push({
      taxId: idDigits && idDigits.length <= 9 ? idDigits.padStart(9, "0") : null,
      name: get(r, "name"),
      account,
      amount,
      date,
      month,
      reference: get(r, "reference") || null,
      line: i + 1,
    });
  });
  if (rows.length === 0) throw new PayslipParseError("לא נמצאו שורות העברה תקינות אחרי המיפוי — בדקו את עמודות הסכום, התאריך והמוטב");
  return { rows, skipped, issues: [] };
}

/* ---------- התאמה לתלושים ---------- */

export type PaymentFindingKind = "pay_no_payslip" | "pay_amount_mismatch" | "pay_not_paid" | "pay_wrong_account" | "pay_shared_account" | "pay_month_total";

export const PAYMENT_FINDING_LABELS: Record<PaymentFindingKind, string> = {
  pay_no_payslip: "העברה למוטב שאין לו תלוש באותו חודש",
  pay_amount_mismatch: "סכום ההעברה שונה מהנטו בתלוש",
  pay_not_paid: "תלוש עם נטו שלא נמצאה לו העברה",
  pay_wrong_account: "ההעברה לחשבון אחר מהרשום בתלוש",
  pay_shared_account: "חשבון אחד מקבל שכר של כמה עובדים",
  pay_month_total: "סך ההעברות בחודש שונה מסך הנטו",
};

export interface PaymentFinding {
  key: string;
  kind: PaymentFindingKind;
  severity: "error" | "warning" | "info";
  subject: string;
  message: string;
  amount?: Agorot;
}

export interface PaymentMonth {
  month: string;
  net: Agorot;
  paid: Agorot;
  payslips: number;
  payments: number;
}

const money = (a: Agorot) => (a / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪";
const monthOf = (date: string) => date.slice(0, 7);
const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const fmtMonth = (m: string) => m.split("-").reverse().join("/");

interface Slip {
  key: string;
  taxId: string;
  name: string;
  month: string;
  net: Agorot;
  account: string | null;
  paid: Agorot;
  payments: PaymentRow[];
}

/**
 * שיוך כל העברה לתלוש: לפי חודש השכר אם הופיע בקובץ; אחרת לפי התאריך — שכר של חודש נתון משולם בדרך כלל
 * בסוף אותו חודש או בתחילת הבא, ולכן נבדקים חודש התאריך והחודש שלפניו (העדפה לתלוש שהנטו שלו שווה לסכום).
 * המוטב מזוהה לפי ת.ז. כשיש, אחרת לפי חשבון הבנק שבתלוש.
 */
export function reconcilePayments(payslips: PayslipRow[], payments: PaymentRow[], opts: { tolerance: Agorot; fiscalYear: number }) {
  const slips = new Map<string, Slip>();
  for (const p of payslips) {
    const key = `${p.taxId}|${p.month}`;
    const s = slips.get(key);
    const account = normalizeAccount(p.bankAccount);
    if (s) {
      s.net += p.net;
      s.account ??= account;
    } else slips.set(key, { key, taxId: p.taxId, name: p.name, month: p.month, net: p.net, account, paid: 0, payments: [] });
  }
  const byAccountMonth = new Map<string, Slip>();
  for (const s of slips.values()) if (s.account) byAccountMonth.set(`${s.account}|${s.month}`, s);

  const findings: PaymentFinding[] = [];
  const unmatched: PaymentRow[] = [];
  for (const pay of payments) {
    // עד ה־15 בחודש — קודם החודש הקודם (שכר שמשולם בתחילת החודש העוקב); אחר כך — קודם חודש התאריך
    const months = pay.month
      ? [pay.month]
      : pay.date
        ? Number(pay.date.slice(8, 10)) <= 15
          ? [prevMonth(monthOf(pay.date)), monthOf(pay.date)]
          : [monthOf(pay.date), prevMonth(monthOf(pay.date))]
        : [];
    const candidates = months
      .map((m) =>
        pay.taxId ? slips.get(`${pay.taxId}|${m}`) : pay.account ? byAccountMonth.get(`${pay.account}|${m}`) : undefined,
      )
      .filter((s): s is Slip => Boolean(s));
    const pick =
      candidates.find((s) => Math.abs(s.net - s.paid - pay.amount) <= opts.tolerance) ??
      candidates.find((s) => s.paid < s.net) ??
      candidates[0];
    if (!pick) {
      unmatched.push(pay);
      continue;
    }
    pick.paid += pay.amount;
    pick.payments.push(pay);
  }

  const inYear = (m: string) => m.startsWith(`${opts.fiscalYear}-`);
  // העברה שאחד מחודשי השכר האפשריים שלה אינו מכוסה בתלושים (למשל ינואר ששילם את דצמבר של השנה הקודמת)
  // — אי אפשר לקבוע שאין לה תלוש; נספרת בנפרד ולא כממצא
  const covered = new Set([...slips.values()].map((s) => s.month));
  const candidateMonths = (pay: PaymentRow) => (pay.month ? [pay.month] : pay.date ? [monthOf(pay.date), prevMonth(monthOf(pay.date))] : []);
  const outOfRange = unmatched.filter((pay) => candidateMonths(pay).some((mo) => !covered.has(mo)));
  const orphans = unmatched.filter((pay) => !outOfRange.includes(pay));
  for (const pay of orphans) {
    const who = pay.name || pay.taxId || pay.account || "מוטב לא מזוהה";
    findings.push({
      key: `pay:${pay.taxId ?? pay.account ?? pay.line}:${pay.date ?? pay.month}:${pay.line}:nopayslip`,
      kind: "pay_no_payslip",
      severity: "error",
      subject: pay.taxId ?? pay.account ?? String(pay.line),
      amount: pay.amount,
      message: `${who}${pay.account ? ` (חשבון ${pay.account})` : ""}: העברה של ${money(pay.amount)}${pay.date ? ` ב־${pay.date.split("-").reverse().join("/")}` : ""} — אין תלוש תואם בחודש השכר`,
    });
  }

  for (const s of slips.values()) {
    if (!inYear(s.month)) continue;
    const who = `${s.name || s.taxId} (${s.taxId}), ${fmtMonth(s.month)}`;
    if (s.payments.length === 0) {
      if (s.net > opts.tolerance) {
        findings.push({ key: `pay:${s.taxId}:${s.month}:unpaid`, kind: "pay_not_paid", severity: "warning", subject: s.taxId, amount: s.net, message: `${who}: נטו ${money(s.net)} בתלוש, ולא נמצאה העברה` });
      }
      continue;
    }
    if (Math.abs(s.paid - s.net) > opts.tolerance) {
      findings.push({
        key: `pay:${s.taxId}:${s.month}:amount`,
        kind: "pay_amount_mismatch",
        severity: s.paid > s.net ? "error" : "warning",
        subject: s.taxId,
        amount: s.paid - s.net,
        message: `${who}: הועברו ${money(s.paid)}, הנטו בתלוש ${money(s.net)} (${s.paid > s.net ? "עודף" : "חוסר"} ${money(Math.abs(s.paid - s.net))})`,
      });
    }
    const other = s.payments.find((p) => p.account && s.account && p.account !== s.account);
    if (other) {
      findings.push({
        key: `pay:${s.taxId}:${s.month}:account`,
        kind: "pay_wrong_account",
        severity: "error",
        subject: s.taxId,
        amount: other.amount,
        message: `${who}: ההעברה לחשבון ${other.account}, ובתלוש רשום חשבון ${s.account}`,
      });
    }
  }

  // חשבון אחד שמקבל שכר של כמה עובדים באותו חודש
  const accountEmployees = new Map<string, Set<string>>();
  for (const s of slips.values()) {
    if (!inYear(s.month)) continue;
    for (const p of s.payments) {
      if (!p.account) continue;
      const k = `${p.account}|${s.month}`;
      accountEmployees.set(k, (accountEmployees.get(k) ?? new Set()).add(s.taxId));
    }
  }
  for (const [k, ids] of accountEmployees) {
    if (ids.size < 2) continue;
    const [account, month] = k.split("|");
    findings.push({
      key: `pay:${account}:${month}:shared`,
      kind: "pay_shared_account",
      severity: "error",
      subject: account,
      message: `חשבון ${account} קיבל ב־${fmtMonth(month)} שכר של ${ids.size} עובדים: ${[...ids].join(", ")}`,
    });
  }

  // סיכום חודשי
  const months = new Map<string, PaymentMonth>();
  const m = (month: string) => {
    let x = months.get(month);
    if (!x) months.set(month, (x = { month, net: 0, paid: 0, payslips: 0, payments: 0 }));
    return x;
  };
  for (const s of slips.values()) {
    if (!inYear(s.month)) continue;
    const x = m(s.month);
    x.net += s.net;
    x.paid += s.paid;
    x.payslips++;
    x.payments += s.payments.length;
  }
  for (const pay of orphans) {
    const month = pay.month ?? (pay.date ? monthOf(pay.date) : null);
    if (month && inYear(month)) {
      const x = m(month);
      x.paid += pay.amount;
      x.payments++;
    }
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const x of monthly) {
    if (Math.abs(x.paid - x.net) > opts.tolerance) {
      findings.push({
        key: `pay:month:${x.month}`,
        kind: "pay_month_total",
        severity: "warning",
        subject: x.month,
        amount: x.paid - x.net,
        message: `${fmtMonth(x.month)}: הועברו ${money(x.paid)}, סך הנטו בתלושים ${money(x.net)} (פער ${money(x.paid - x.net)})`,
      });
    }
  }

  return { findings, monthly, matched: payments.length - unmatched.length, unmatched: orphans.length, outOfRange: outOfRange.length };
}
