import type { Agorot } from "../money";
import type { LedgerAccount, LedgerLine } from "./types";

/**
 * סקירה אנליטית: השוואת יתרות לשנה קודמת ואיתור חודשים חריגים.
 * תוצאה מסומנת היא "צריך הסבר" — לא בהכרח טעות. ההסבר מתועד בתיק.
 */

export interface AccountWithGroup extends LedgerAccount {
  trialBalanceCode?: string | null;
  trialBalanceName?: string | null;
}

export type ChangeFlag = "significant" | "new" | "removed";

export interface ComparisonRow {
  key: string;
  label: string;
  prior: Agorot;
  current: Agorot;
  change: Agorot;
  /**
   * שינוי בגודל היתרה באחוזים: חיובי = היתרה גדלה (גם בחשבונות זכות, כמו הכנסות).
   * null כשאין בסיס להשוואה (יתרה קודמת אפס)
   */
  changePct: number | null;
  flag: ChangeFlag | null;
}

export interface ComparisonOptions {
  performanceMateriality: Agorot;
  /** שינוי באחוזים שמעליו (יחד עם המהותיות) מסמנים. ברירת מחדל 10% */
  pctThreshold?: number;
  /** השוואה לפי חשבון, או לפי קבוצה במאזן הבוחן (כשקיימת בקובץ) */
  by: "account" | "group";
}

export function closingBalances(accounts: AccountWithGroup[], lines: LedgerLine[]) {
  const balances = new Map<string, Agorot>();
  for (const a of accounts) balances.set(a.code, a.openingBalance);
  for (const l of lines) balances.set(l.accountCode, (balances.get(l.accountCode) ?? 0) + l.amount);
  return balances;
}

function aggregate(accounts: AccountWithGroup[], lines: LedgerLine[], by: ComparisonOptions["by"]) {
  const balances = closingBalances(accounts, lines);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const result = new Map<string, { label: string; balance: Agorot }>();
  for (const [code, balance] of balances) {
    const a = byCode.get(code);
    const groupKey = a?.trialBalanceCode || null;
    const key = by === "group" && groupKey ? `g:${groupKey}` : `a:${code}`;
    const label =
      by === "group" && groupKey ? (a?.trialBalanceName || groupKey) : `${code} · ${a?.name ?? "(חשבון לא מוגדר)"}`;
    const row = result.get(key) ?? { label, balance: 0 };
    row.balance += balance;
    result.set(key, row);
  }
  return result;
}

export function compareYears(
  current: { accounts: AccountWithGroup[]; lines: LedgerLine[] },
  prior: { accounts: AccountWithGroup[]; lines: LedgerLine[] },
  opts: ComparisonOptions,
): ComparisonRow[] {
  const pctThreshold = opts.pctThreshold ?? 10;
  const cur = aggregate(current.accounts, current.lines, opts.by);
  const pri = aggregate(prior.accounts, prior.lines, opts.by);
  const keys = new Set([...cur.keys(), ...pri.keys()]);
  const rows: ComparisonRow[] = [];
  for (const key of keys) {
    const c = cur.get(key);
    const p = pri.get(key);
    const currentBal = c?.balance ?? 0;
    const priorBal = p?.balance ?? 0;
    if (currentBal === 0 && priorBal === 0) continue;
    const change = currentBal - priorBal;
    const changePct = priorBal === 0 ? null : (change / priorBal) * 100;
    let flag: ChangeFlag | null = null;
    const material = Math.abs(change) >= opts.performanceMateriality;
    if (!p && material) flag = "new";
    else if (!c && material) flag = "removed";
    else if (material && (changePct === null || Math.abs(changePct) >= pctThreshold)) flag = "significant";
    rows.push({ key, label: c?.label ?? p!.label, prior: priorBal, current: currentBal, change, changePct, flag });
  }
  return rows.sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || Math.abs(b.change) - Math.abs(a.change));
}

export interface MonthlySpike {
  accountCode: string;
  accountName: string;
  month: string; // YYYY-MM
  movement: Agorot;
  average: Agorot;
}

/**
 * חודשים חריגים: בכל חשבון, חודש שהתנועה נטו בו רחוקה מהממוצע החודשי ביותר משתי סטיות תקן
 * וגם גדולה מהמהותיות לביצוע. (למשל קפיצה בהכנסות בדצמבר — חשד להקדמת הכנסה.)
 */
export function monthlySpikes(accounts: LedgerAccount[], lines: LedgerLine[], performanceMateriality: Agorot): MonthlySpike[] {
  const names = new Map(accounts.map((a) => [a.code, a.name]));
  const byAccount = new Map<string, Map<string, Agorot>>();
  for (const l of lines) {
    const months = byAccount.get(l.accountCode) ?? new Map<string, Agorot>();
    const m = l.date.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + l.amount);
    byAccount.set(l.accountCode, months);
  }
  const spikes: MonthlySpike[] = [];
  for (const [code, months] of byAccount) {
    if (months.size < 4) continue; // מעט מדי חודשים לסטטיסטיקה
    const values = [...months.values()];
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    for (const [month, movement] of months) {
      if (std > 0 && Math.abs(movement - mean) > 2 * std && Math.abs(movement - mean) >= performanceMateriality) {
        spikes.push({ accountCode: code, accountName: names.get(code) ?? code, month, movement, average: Math.round(mean) });
      }
    }
  }
  return spikes.sort((a, b) => Math.abs(b.movement - b.average) - Math.abs(a.movement - a.average));
}
