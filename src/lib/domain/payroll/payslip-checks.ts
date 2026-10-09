import type { Agorot } from "../money";
import { isValidIsraeliId } from "../israeli-id";
import type { PayrollFinding } from "./checks";
import type { PayslipRow } from "./payslips";
import type { PayrollFile } from "./types";
import { expectedEmployeeNi, minimumWageAt, OVERTIME, PENSION } from "./rates";

/**
 * בדיקות על תלושים חודשיים (ריכוז שכר): בתוך התלוש, לאורך השנה לעובד, בין עובדים, ומול קובץ 126.
 * ממצאים שנשענים על פרמטרים חוקיים (שכר מינימום, שיעורי ב"ל, פנסיה) מסומנים ב־"⚠ לאימות רו"ח".
 */

export type PayslipFindingKind =
  | "ps_invalid_id"
  | "ps_net_mismatch"
  | "ps_below_minimum"
  | "ps_overtime_share"
  | "ps_overtime_hours"
  | "ps_overtime_rate"
  | "ps_ni_employee"
  | "ps_pension_rate"
  | "ps_no_pension"
  | "ps_negative"
  | "ps_duplicate_slip"
  | "ps_too_many_slips"
  | "ps_paid_after_end"
  | "ps_wage_jump"
  | "ps_shared_bank"
  | "ps_vs_102_month"
  | "ps_vs_126_employee"
  | "ps_only_in_slips"
  | "ps_only_in_126"
  | "ps_round_net";

export const PAYSLIP_FINDING_LABELS: Record<PayslipFindingKind, string> = {
  ps_invalid_id: "מספר זהות לא תקין בתלוש",
  ps_net_mismatch: "נטו שונה מברוטו פחות ניכויים",
  ps_below_minimum: "שכר מתחת לשכר המינימום ⚠",
  ps_overtime_share: "שיעור שעות נוספות גבוה",
  ps_overtime_hours: "שעות נוספות מעבר למותר ⚠",
  ps_overtime_rate: "תעריף שעות נוספות נמוך מהחוק ⚠",
  ps_ni_employee: "ביטוח לאומי עובד שונה מהצפוי ⚠",
  ps_pension_rate: "הפרשת מעסיק לפנסיה נמוכה מהצו ⚠",
  ps_no_pension: "תלוש ללא הפרשה לפנסיה לעובד ותיק",
  ps_negative: "סכום שלילי בתלוש",
  ps_duplicate_slip: "שני תלושים לאותו עובד באותו חודש",
  ps_too_many_slips: "יותר מ־12 תלושים בשנה",
  ps_paid_after_end: "תלוש אחרי חודש סיום ההעסקה",
  ps_wage_jump: "קפיצה בשכר בין חודשים",
  ps_shared_bank: "חשבון בנק משותף לכמה עובדים",
  ps_vs_102_month: "סיכום התלושים שונה מדיווח 102 של החודש",
  ps_vs_126_employee: "סיכום התלושים לעובד שונה מרשומת 126",
  ps_only_in_slips: "עובד בתלושים ולא בקובץ 126",
  ps_only_in_126: "עובד בקובץ 126 ולא בתלושים",
  ps_round_net: "נטו עגול באופן חוזר",
};

export type PayslipFinding = Omit<PayrollFinding, "kind"> & { kind: PayslipFindingKind };

const money = (a: Agorot) => (a / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪";
const label = (r: PayslipRow) => `${r.name || r.taxId} (${r.taxId})`;
const monthLabel = (m: string) => m.split("-").reverse().join("/");
const sumDefined = (...xs: (Agorot | null)[]) => xs.reduce<Agorot>((s, x) => s + (x ?? 0), 0);

export function checkPayslipRows(rows: PayslipRow[]): PayslipFinding[] {
  const out: PayslipFinding[] = [];
  const push = (f: PayslipFinding) => out.push(f);

  // --- בתוך התלוש ---
  for (const r of rows) {
    const who = label(r);
    const key = `payslip:${r.taxId}:${r.month}`;
    if (!/^\d{9}$/.test(r.taxId) || (!isValidIsraeliId(r.taxId) && !/^0/.test(r.taxId) && !/^(66|75|77)/.test(r.taxId))) {
      if (/^\d{9}$/.test(r.taxId) && !isValidIsraeliId(r.taxId)) {
        push({ key: `${key}:id`, kind: "ps_invalid_id", severity: "error", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ספרת הביקורת של מספר הזהות אינה תקינה` });
      }
    }
    const deductions = r.totalDeductions ?? (r.incomeTax === null && r.niEmployee === null ? null : sumDefined(r.incomeTax, r.niEmployee, r.healthEmployee, r.pensionEmployee, r.studyFundEmployee, r.otherDeductions));
    if (deductions !== null) {
      const expectedNet = r.gross - deductions;
      if (Math.abs(expectedNet - r.net) > 5_00) {
        push({ key: `${key}:net`, kind: "ps_net_mismatch", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ברוטו ${money(r.gross)} פחות ניכויים ${money(deductions)} = ${money(expectedNet)}, אך הנטו ${money(r.net)} (הפרש ${money(r.net - expectedNet)}) — ניכוי שלא בעמודות, או טעות`, amount: r.net - expectedNet });
      }
    }
    for (const [field, value] of [["ברוטו", r.gross], ["נטו", r.net], ["מס הכנסה", r.incomeTax], ["ביטוח לאומי", r.niEmployee]] as const) {
      if (value !== null && value < 0) push({ key: `${key}:neg:${field}`, kind: "ps_negative", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ${field} שלילי (${money(value)}) — תיקון רטרואקטיבי? לתעד`, amount: value });
    }
    // שכר מינימום: לפי ערך שעה אם יש, אחרת שכר יסוד מול מינימום × אחוז משרה
    const min = minimumWageAt(r.month);
    if (min) {
      if (r.hourlyRate !== null && r.hourlyRate > 0 && r.hourlyRate < min.hourly - 1) {
        push({ key: `${key}:min`, kind: "ps_below_minimum", severity: "error", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ערך שעה ${money(r.hourlyRate)} נמוך משכר המינימום לשעה ${money(min.hourly)}`, amount: r.hourlyRate - min.hourly });
      } else if (r.hourlyRate === null && r.baseSalary !== null && r.hours !== null && r.hours > 0) {
        const rate = Math.round(r.baseSalary / r.hours);
        if (rate < min.hourly * 0.98) push({ key: `${key}:min`, kind: "ps_below_minimum", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: שכר יסוד ${money(r.baseSalary)} ל־${r.hours} שעות = ${money(rate)} לשעה, מתחת למינימום ${money(min.hourly)}`, amount: rate - min.hourly });
      } else if (r.hourlyRate === null && r.hours === null && r.baseSalary !== null && r.jobPercent !== null && r.jobPercent > 0) {
        const expected = Math.round((min.monthly * Math.min(r.jobPercent, 100)) / 100);
        if (r.baseSalary < expected * 0.98) push({ key: `${key}:min`, kind: "ps_below_minimum", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: שכר יסוד ${money(r.baseSalary)} ב־${r.jobPercent}% משרה, מתחת למינימום היחסי ${money(expected)}`, amount: r.baseSalary - expected });
      }
    }
    // שעות נוספות
    if (r.overtimeHours !== null && r.overtimeHours > OVERTIME.maxMonthlyOvertimeHours) {
      push({ key: `${key}:othours`, kind: "ps_overtime_hours", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ${r.overtimeHours} שעות נוספות — מעל ~${OVERTIME.maxMonthlyOvertimeHours} לחודש המותרות בהיתר הכללי (16 בשבוע)` });
    }
    if (r.overtimePay !== null && r.gross > 0 && r.overtimePay / r.gross > 0.3) {
      push({ key: `${key}:otshare`, kind: "ps_overtime_share", severity: "info", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: שעות נוספות ${money(r.overtimePay)} הן ${Math.round((r.overtimePay / r.gross) * 100)}% מהברוטו`, amount: r.overtimePay });
    }
    if (r.overtimePay !== null && r.overtimeHours !== null && r.overtimeHours > 0 && r.hourlyRate !== null && r.hourlyRate > 0) {
      const minPay = Math.round(r.overtimeHours * r.hourlyRate * OVERTIME.firstTwoHoursRate);
      if (r.overtimePay < minPay * 0.98) push({ key: `${key}:otrate`, kind: "ps_overtime_rate", severity: "warning", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ${r.overtimeHours} ש"נ שולמו ${money(r.overtimePay)} — פחות מ־125% × ערך שעה (${money(minPay)} לפחות)`, amount: r.overtimePay - minPay });
    }
    // ביטוח לאומי עובד מול השיעורים
    const niBase = r.niWages ?? r.gross;
    const niPaid = r.niEmployee === null ? null : r.niEmployee + (r.healthEmployee ?? 0);
    if (niPaid !== null && niBase > 0) {
      const expected = expectedEmployeeNi(r.month, niBase);
      // משווים רק כשגם הבריאות בעמודה (או כלולה); סובלנות 15% — יש קטגוריות (נוער, פנסיונרים) עם שיעורים אחרים
      if (expected !== null && r.healthEmployee !== null && Math.abs(niPaid - expected) > Math.max(20_00, expected * 0.15)) {
        push({ key: `${key}:ni`, kind: "ps_ni_employee", severity: "info", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: ב"ל + בריאות ${money(niPaid)} לעומת ${money(expected)} לפי השיעורים לשכיר רגיל — קטגוריה אחרת (נוער / פנסיונר / תושב חוץ) או טעות`, amount: niPaid - expected });
      }
    }
    // פנסיה: שיעור מעסיק מול הצו (על שכר היסוד אם יש, אחרת על הברוטו — מחמיר פחות)
    const pensionBase = r.baseSalary ?? r.gross;
    if (r.pensionEmployer !== null && pensionBase > 0 && r.pensionEmployer > 0 && (r.pensionEmployer / pensionBase) * 100 < PENSION.employer - 0.6) {
      push({ key: `${key}:pens`, kind: "ps_pension_rate", severity: "info", subject: r.taxId, message: `${who}, ${monthLabel(r.month)}: תגמולי מעסיק ${money(r.pensionEmployer)} הם ${((r.pensionEmployer / pensionBase) * 100).toFixed(1)}% מ־${money(pensionBase)}, מתחת ל־${PENSION.employer}% שבצו ההרחבה (ייתכן שהבסיס המבוטח נמוך יותר או שיש תקרה)`, amount: r.pensionEmployer });
    }
  }

  // --- לאורך השנה לעובד ---
  const byEmployee = new Map<string, PayslipRow[]>();
  for (const r of rows) byEmployee.set(r.taxId, [...(byEmployee.get(r.taxId) ?? []), r]);
  for (const [taxId, slips] of byEmployee) {
    const sorted = [...slips].sort((a, b) => a.month.localeCompare(b.month));
    const who = label(sorted[0]);
    const months = new Map<string, number>();
    for (const s of sorted) months.set(s.month, (months.get(s.month) ?? 0) + 1);
    for (const [m, n] of months) if (n > 1) push({ key: `payslip:${taxId}:${m}:dup`, kind: "ps_duplicate_slip", severity: "warning", subject: taxId, message: `${who}: ${n} תלושים לחודש ${monthLabel(m)} — הפרשי שכר או כפל תשלום` });
    if (sorted.length > 12) push({ key: `payslip:${taxId}:count`, kind: "ps_too_many_slips", severity: "warning", subject: taxId, message: `${who}: ${sorted.length} תלושים בשנה` });
    const end = sorted.map((s) => s.endDate).filter(Boolean).sort().pop() ?? null;
    if (end) {
      const endMonth = end.slice(0, 7);
      const after = sorted.filter((s) => s.month > endMonth && s.gross > 0);
      // גמר חשבון בחודש העוקב — סביר; מעבר לזה — ממצא
      for (const s of after.filter((x) => x.month > nextMonth(endMonth))) {
        push({ key: `payslip:${taxId}:${s.month}:after`, kind: "ps_paid_after_end", severity: "error", subject: taxId, message: `${who}: תלוש ${monthLabel(s.month)} על ${money(s.gross)} למרות סיום ההעסקה ב־${end}`, amount: s.gross });
      }
    }
    // פנסיה חסרה לעובד ותיק (יותר מ־6 חודשים מתחילת העבודה) — רק אם יש עמודת פנסיה בכלל
    const hasPensionColumn = sorted.some((s) => s.pensionEmployer !== null);
    const start = sorted.map((s) => s.startDate).filter(Boolean).sort()[0] ?? null;
    if (hasPensionColumn && start) {
      for (const s of sorted) {
        const tenure = monthsBetween(start.slice(0, 7), s.month);
        if (tenure > PENSION.waitingMonthsNewEmployee && s.gross > 0 && !s.pensionEmployer && !s.severanceEmployer) {
          push({ key: `payslip:${taxId}:${s.month}:nopens`, kind: "ps_no_pension", severity: "warning", subject: taxId, message: `${who}, ${monthLabel(s.month)}: ללא הפרשות מעסיק לפנסיה/פיצויים אחרי ${tenure} חודשי ותק`, amount: s.gross });
        }
      }
    }
    // קפיצה בשכר: ברוטו של חודש גבוה מפי 1.5 מהחציון של העובד (ולפחות 3 תלושים)
    if (sorted.length >= 3) {
      const g = sorted.map((s) => s.gross).sort((a, b) => a - b);
      const med = g[Math.floor(g.length / 2)];
      for (const s of sorted) {
        if (med > 0 && s.gross > med * 1.5 && s.gross - med > 2_000_00) {
          push({ key: `payslip:${taxId}:${s.month}:jump`, kind: "ps_wage_jump", severity: "info", subject: taxId, message: `${who}, ${monthLabel(s.month)}: ברוטו ${money(s.gross)} לעומת חציון ${money(med)} — בונוס, הבראה, פדיון חופשה? לתעד`, amount: s.gross - med });
        }
      }
    }
    // נטו עגול בכל התלושים (סימן לתשלום "מסוכם" ולא מחושב)
    const nets = sorted.filter((s) => s.net > 0);
    if (nets.length >= 3 && nets.every((s) => s.net % 1000_00 === 0 || s.net % 500_00 === 0)) {
      push({ key: `payslip:${taxId}:round`, kind: "ps_round_net", severity: "info", subject: taxId, message: `${who}: הנטו עגול (${money(nets[0].net)}) בכל ${nets.length} התלושים — שכר נטו מוסכם? לבדוק גילום` });
    }
  }

  // --- בין עובדים: חשבון בנק משותף ---
  const byBank = new Map<string, Set<string>>();
  for (const r of rows) if (r.bankAccount && r.bankAccount.replace(/\D/g, "").length >= 5) byBank.set(r.bankAccount, new Set([...(byBank.get(r.bankAccount) ?? []), r.taxId]));
  for (const [acct, ids] of byBank) {
    if (ids.size > 1) push({ key: `payslip:bank:${acct}`, kind: "ps_shared_bank", severity: "warning", subject: acct, message: `חשבון בנק ${acct} משותף ל־${ids.size} עובדים (${[...ids].join(", ")}) — בני זוג, או הפניית תשלום` });
  }
  return out;
}

function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** סיכומי התלושים לפי חודש */
export function payslipMonths(rows: PayslipRow[]) {
  const map = new Map<string, { month: string; employees: number; gross: Agorot; incomeTax: Agorot; net: Agorot; niEmployee: Agorot; employerCost: Agorot | null }>();
  for (const r of rows) {
    const m = map.get(r.month) ?? { month: r.month, employees: 0, gross: 0, incomeTax: 0, net: 0, niEmployee: 0, employerCost: 0 };
    m.employees += 1;
    m.gross += r.gross;
    m.incomeTax += r.incomeTax ?? 0;
    m.net += r.net;
    m.niEmployee += (r.niEmployee ?? 0) + (r.healthEmployee ?? 0);
    m.employerCost = r.employerCost === null || m.employerCost === null ? null : m.employerCost + r.employerCost;
    map.set(r.month, m);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** השוואת התלושים לקובץ 126: לפי חודש (מול רשומות 50 = 102) ולפי עובד (מול רשומות 20) */
export function comparePayslipsToForm126(rows: PayslipRow[], file: PayrollFile, tolerance: Agorot): PayslipFinding[] {
  const out: PayslipFinding[] = [];
  const months = payslipMonths(rows);
  const byMonth = new Map(file.months.map((m) => [m.month, m]));
  for (const m of months) {
    const f = byMonth.get(m.month);
    if (!f) continue;
    const grossDiff = m.gross - f.wagesTaxable;
    const taxDiff = m.incomeTax - f.taxWithheld;
    const hasTax = rows.some((r) => r.incomeTax !== null);
    if (Math.abs(grossDiff) > tolerance || (hasTax && Math.abs(taxDiff) > tolerance) || m.employees !== f.employeeCount) {
      const parts = [];
      if (Math.abs(grossDiff) > tolerance) parts.push(`ברוטו ${money(m.gross)} מול ${money(f.wagesTaxable)} ב־102 (הפרש ${money(grossDiff)})`);
      if (hasTax && Math.abs(taxDiff) > tolerance) parts.push(`מס ${money(m.incomeTax)} מול ${money(f.taxWithheld)} (הפרש ${money(taxDiff)})`);
      if (m.employees !== f.employeeCount) parts.push(`${m.employees} תלושים מול ${f.employeeCount} עובדים ב־102`);
      out.push({ key: `payslip:vs102:${m.month}`, kind: "ps_vs_102_month", severity: Math.abs(grossDiff) > tolerance ? "warning" : "info", subject: m.month, message: `${monthLabel(m.month)}: ${parts.join(" · ")}`, amount: grossDiff });
    }
  }
  const slipsById = new Map<string, PayslipRow[]>();
  for (const r of rows) slipsById.set(r.taxId, [...(slipsById.get(r.taxId) ?? []), r]);
  const fileById = new Map<string, PayrollFile["employees"]>();
  for (const e of file.employees) fileById.set(e.taxId, [...(fileById.get(e.taxId) ?? []), e]);
  for (const [id, slips] of slipsById) {
    const recs = fileById.get(id);
    if (!recs) {
      out.push({ key: `payslip:only:${id}`, kind: "ps_only_in_slips", severity: "warning", subject: id, message: `${label(slips[0])}: ${slips.length} תלושים בסך ${money(slips.reduce((s, r) => s + r.gross, 0))}, אך אינו מופיע בקובץ 126 — לא דווח לרשויות?`, amount: slips.reduce((s, r) => s + r.gross, 0) });
      continue;
    }
    const gross = slips.reduce((s, r) => s + r.gross, 0);
    const fileGross = recs.reduce((s, e) => s + e.grossWages, 0);
    const tax = slips.reduce((s, r) => s + (r.incomeTax ?? 0), 0);
    const fileTax = recs.reduce((s, e) => s + e.taxWithheld, 0);
    const hasTax = slips.some((r) => r.incomeTax !== null);
    const months = new Set(slips.map((s) => s.month)).size;
    const fileMonths = recs.reduce((s, e) => s + e.monthsWorked, 0);
    if (Math.abs(gross - fileGross) > tolerance || (hasTax && Math.abs(tax - fileTax) > tolerance) || months !== fileMonths) {
      const parts = [];
      if (Math.abs(gross - fileGross) > tolerance) parts.push(`ברוטו ${money(gross)} מול ${money(fileGross)} (הפרש ${money(gross - fileGross)})`);
      if (hasTax && Math.abs(tax - fileTax) > tolerance) parts.push(`מס ${money(tax)} מול ${money(fileTax)}`);
      if (months !== fileMonths) parts.push(`${months} חודשים מול ${fileMonths}`);
      out.push({ key: `payslip:vs126:${id}`, kind: "ps_vs_126_employee", severity: Math.abs(gross - fileGross) > tolerance ? "warning" : "info", subject: id, message: `${label(slips[0])}: ${parts.join(" · ")}`, amount: gross - fileGross });
    }
  }
  for (const [id, recs] of fileById) {
    if (!slipsById.has(id) && recs.some((e) => e.grossWages > 0)) {
      out.push({ key: `payslip:missing:${id}`, kind: "ps_only_in_126", severity: "warning", subject: id, message: `${recs[0].firstName} ${recs[0].lastName} (${id}): דווח בקובץ 126 על ${money(recs.reduce((s, e) => s + e.grossWages, 0))} אך אין לו תלושים בריכוז השכר`, amount: recs.reduce((s, e) => s + e.grossWages, 0) });
    }
  }
  return out;
}
