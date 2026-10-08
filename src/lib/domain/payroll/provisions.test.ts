import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "../ledger/types";
import type { PayslipRow } from "./payslips";
import { suggestPayrollAccounts } from "./ledger-reconciliation";
import { compareProvisionsToBooks, computeYearEndProvisions, provisionFindings } from "./provisions";

const slip = (over: Partial<PayslipRow>): PayslipRow => ({
  taxId: "000000018", employeeNo: null, name: "עובד", month: "2025-01", startDate: null, endDate: null, jobPercent: 100,
  hours: null, overtimeHours: null, hourlyRate: null, baseSalary: 12_000_00, overtimePay: null, gross: 12_000_00, taxableGross: null,
  niWages: null, incomeTax: null, niEmployee: null, healthEmployee: null, pensionEmployee: null, studyFundEmployee: null,
  otherDeductions: null, totalDeductions: null, net: 9_000_00, pensionEmployer: null, severanceEmployer: null, studyFundEmployer: null,
  niEmployer: null, employerCost: null, recuperationPay: null, vacationBalance: null, sickBalance: null, bankAccount: null,
  department: null, line: 1, ...over,
});
const months = (n: number, f: (m: string, i: number) => Partial<PayslipRow>) =>
  Array.from({ length: n }, (_, i) => {
    const m = `2025-${String(i + 1).padStart(2, "0")}`;
    return slip({ month: m, line: i + 1, ...f(m, i) });
  });

// א: ותיקה (11 שנים), משרה מלאה, 8.33% לפיצויים, קיבלה 7 ימי הבראה ביולי, 10 ימי חופשה צבורים
const a = months(12, (m) => ({
  taxId: "000000018", name: "אורית", startDate: "2015-03-01", severanceEmployer: 999_60,
  recuperationPay: m === "2025-07" ? 2_926_00 : 0, vacationBalance: m === "2025-12" ? 10 : 5,
}));
// ב: שנה וחצי ותק, חצי משרה, 6% לפיצויים, לא קיבל הבראה, יתרת חופשה שלילית
const b = months(12, () => ({
  taxId: "000000026", name: "בני", startDate: "2024-07-01", jobPercent: 50, baseSalary: 6_000_00, gross: 6_000_00, severanceEmployer: 360_00,
  vacationBalance: -2,
}));
// ג: סיים ביוני — לא נכלל
const c = months(6, () => ({ taxId: "000000034", name: "גיל", startDate: "2020-01-01", endDate: "2025-06-30", vacationBalance: 3 }));
// ד: אין תאריך תחילה
const d = months(12, () => ({ taxId: "000000042", name: "דנה", vacationBalance: 0, severanceEmployer: 0 }));

describe("computeYearEndProvisions", () => {
  const r = computeYearEndProvisions([...a, ...b, ...c, ...d], 2025);
  const by = (id: string) => r.employees.find((e) => e.taxId === id)!;

  it("includes only employees active at year end", () => {
    expect(r.employees.map((e) => e.taxId).sort()).toEqual(["000000018", "000000026", "000000042"]);
    expect(r.excluded).toBe(1);
    expect(r.missing).toEqual({ vacationBalance: false, recuperationPay: false, severance: false, startDate: 1 });
  });

  it("values vacation as December balance × monthly base / 21.67", () => {
    const e = by("000000018");
    expect(e.dailyValue).toBe(Math.round(12_000_00 / 21.67));
    expect(e.vacation).toBe(10 * Math.round(12_000_00 / 21.67));
    // יתרה שלילית לא יוצרת הפרשה שלילית
    expect(by("000000026").vacation).toBe(0);
  });

  it("computes unpaid recuperation by seniority, job share and payments", () => {
    // שנה 11 → 8 ימים × 418 ₪; שולמו 7 ימים
    expect(by("000000018").recuperationEntitled).toBe(8 * 418_00);
    expect(by("000000018").recuperation).toBe(418_00);
    // שנה 2 → 6 ימים × 418 ₪ × 50%, לא שולם
    expect(by("000000026").recuperation).toBe(Math.round(6 * 418_00 * 0.5));
    expect(by("000000042").recuperation).toBeNull();
  });

  it("computes the uncovered severance share", () => {
    expect(by("000000018").severanceRate).toBeCloseTo(8.33, 2);
    expect(by("000000018").severance).toBe(0);
    const e = by("000000026");
    expect(e.severanceRate).toBe(6);
    const years = (Date.parse("2025-12-31") - Date.parse("2024-07-01")) / 86_400_000 / 365.25;
    expect(e.severance).toBe(Math.round(6_000_00 * years * (1 - 6 / 8.33)));
    expect(by("000000042").severance).toBeNull();
  });

  it("raises findings for the problem cases", () => {
    const kinds = provisionFindings(r).map((f) => `${f.kind}:${f.subject}`);
    expect(kinds).toContain("prov_negative_vacation:000000026");
    expect(kinds).toContain("prov_recuperation_unpaid:000000018");
    expect(kinds).toContain("prov_recuperation_unpaid:000000026");
    expect(kinds).toContain("prov_partial_severance:000000026");
    expect(kinds).toContain("prov_missing_start:000000042");
    expect(kinds).not.toContain("prov_partial_severance:000000018");
  });

  it("reports missing columns instead of guessing", () => {
    const bare = computeYearEndProvisions(months(12, () => ({ startDate: "2020-01-01" })), 2025);
    expect(bare.missing).toMatchObject({ vacationBalance: true, recuperationPay: true, severance: true });
    expect(bare.employees[0]).toMatchObject({ vacation: null, recuperation: null, severance: null });
    // הזכאות עדיין מחושבת, רק אי אפשר לדעת כמה שולם
    expect(bare.employees[0].recuperationEntitled).toBe(7 * 418_00);
  });
});

describe("compareProvisionsToBooks", () => {
  const accounts: LedgerAccount[] = [
    { code: "2140", name: "הפרשה לחופשה והבראה", openingBalance: -7_000_00 },
    { code: "2900", name: "התחייבות בשל סיום יחסי עובד מעביד, נטו", openingBalance: 0 },
  ];
  const mapping = suggestPayrollAccounts(accounts);
  const r = computeYearEndProvisions([...a, ...b, ...d], 2025);

  it("compares vacation+recuperation and severance to year-end balances", () => {
    const rows = compareProvisionsToBooks(r, accounts, [], mapping, { from: "2025-01-01", to: "2025-12-31", tolerance: 1_00 });
    const vac = rows.find((x) => x.group === "vacationProvision")!;
    expect(vac.computed).toBe(r.totals.vacation + r.totals.recuperation);
    expect(vac.books).toBe(7_000_00);
    // פער של כ־3% — בתוך 10%
    expect(vac.status).toBe("ok");
    const sev = rows.find((x) => x.group === "severanceLiability")!;
    expect(sev.books).toBe(0);
    expect(sev.status).toBe("diff");
  });

  it("marks groups without mapped accounts", () => {
    const rows = compareProvisionsToBooks(r, accounts, [], { ...mapping, severanceLiability: [] }, { from: "2025-01-01", to: "2025-12-31", tolerance: 1_00 });
    expect(rows.find((x) => x.group === "severanceLiability")!.status).toBe("unmapped");
  });
});
