import { describe, expect, it } from "vitest";
import { reconcilePayrollToLedger, suggestPayrollAccounts } from "./ledger-reconciliation";
import type { LedgerAccount, LedgerLine } from "../ledger/types";
import type { PayrollFile } from "./types";

const accounts: LedgerAccount[] = [
  { code: "6000", name: "הוצאות שכר", openingBalance: 0 },
  { code: "6010", name: "משכורות הנהלה", openingBalance: 0 },
  { code: "6020", name: "ביטוח לאומי מעביד", openingBalance: 0 },
  { code: "6030", name: "הפרשות סוציאליות", openingBalance: 0 },
  { code: "2100", name: "מס הכנסה ניכויים", openingBalance: -5_000_00 },
  { code: "2110", name: "ביטוח לאומי לשלם", openingBalance: 0 },
  { code: "2120", name: "קופות גמל לשלם", openingBalance: 0 },
  { code: "2130", name: "עובדים - נטו לתשלום", openingBalance: 0 },
  { code: "2140", name: "הפרשה לחופשה והבראה", openingBalance: 0 },
  { code: "2900", name: "התחייבות בשל סיום יחסי עובד מעביד, נטו", openingBalance: 0 },
  { code: "4000", name: "הכנסות", openingBalance: 0 },
  { code: "6500", name: "מס שכר", openingBalance: 0 },
];

describe("suggestPayrollAccounts", () => {
  it("maps accounts by name into the right groups", () => {
    const m = suggestPayrollAccounts(accounts);
    expect(m.salaryExpense).toEqual(["6000", "6010"]);
    expect(m.niEmployerExpense).toEqual(["6020"]);
    expect(m.socialExpense).toEqual(["6030"]);
    expect(m.incomeTaxPayable).toEqual(["2100"]);
    expect(m.niPayable).toEqual(["2110"]);
    expect(m.fundsPayable).toEqual(["2120"]);
    expect(m.netWagesPayable).toEqual(["2130"]);
    expect(m.vacationProvision).toEqual(["2140"]);
    expect(m.severanceLiability).toEqual(["2900"]);
    // מס שכר (מלכ"ר) אינו הוצאות שכר
    expect(Object.values(m).flat()).not.toContain("6500");
  });
});

describe("reconcilePayrollToLedger", () => {
  const file: PayrollFile = {
    employer: { deductionsFileId: "912345678", name: "לקוח", taxYear: 2025, corporationNo: "00", declaredEmployees: 2, raw: {} },
    employees: [
      { taxId: "000000018", idKind: "israeli", lastName: "", firstName: "", birthDate: null, startDate: null, endDate: null, monthsWorked: 12, jobType: "01", grossWages: 600_000_00, benefitsInKind: 0, exemptIncome: 0, niWages: 600_000_00, taxWithheld: 60_000_00, niEmployee: 40_000_00, pensionEmployee: 0, pensionEmployer: 39_000_00, severanceEmployer: 50_000_00, studyFundEmployee: 0, studyFundEmployer: 0, severancePaid: 0, creditPoints: null, raw: {} },
    ],
    months: Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`, employeeCount: 1, wagesTaxable: 50_000_00, taxWithheld: 5_000_00, wagesNi: 50_000_00, niTotal: 6_000_00, payrollTax: 0, foreignWorkersLevy: 0, raw: {},
    })),
    declared: { employeeRecords: 1, sums: {}, raw: {} },
    issues: [],
  };
  // פקודות שכר חודשיות: הוצאה 50,000 + ב"ל מעביד 2,667 + סוציאליות 7,417; זכות למוסדות
  const lines: LedgerLine[] = [];
  for (let m = 1; m <= 12; m++) {
    const d = `2025-${String(m).padStart(2, "0")}-28`;
    const e = String(m);
    lines.push(
      { entryId: e, date: d, accountCode: "6000", amount: 50_000_00, description: "שכר", reference: null },
      { entryId: e, date: d, accountCode: "6020", amount: 2_666_67, description: "", reference: null },
      { entryId: e, date: d, accountCode: "6030", amount: 7_416_67, description: "", reference: null },
      { entryId: e, date: d, accountCode: "2100", amount: -5_000_00, description: "", reference: null },
      { entryId: e, date: d, accountCode: "2110", amount: -6_000_00, description: "", reference: null },
    );
    // תשלום 102 של החודש הקודם
    if (m > 1) lines.push({ entryId: `p${m}`, date: d, accountCode: "2100", amount: 5_000_00, description: "תשלום 102", reference: null });
  }

  it("matches when the books agree with the payroll, within tolerance", () => {
    const rows = reconcilePayrollToLedger(file, accounts, lines, suggestPayrollAccounts(accounts), { from: "2025-01-01", to: "2025-12-31", tolerance: 100_00 });
    const by = Object.fromEntries(rows.map((r) => [r.group, r]));
    expect(by.salaryExpense.status).toBe("ok");
    expect(by.salaryExpense.books).toBe(600_000_00);
    // ב"ל מעביד = 72,000 סך דמי ביטוח − 40,000 שנוכו מהעובד = 32,000 ≈ 12 × 2,666.67
    expect(by.niEmployerExpense.payroll).toBe(32_000_00);
    expect(by.niEmployerExpense.status).toBe("ok");
    expect(by.socialExpense.status).toBe("ok");
    expect(by.incomeTaxPayable.status).toBe("ok");
    // יתרה: פתיחה 5,000 זכות + 12×5,000 זכות − 11×5,000 חובה = 10,000 זכות; צפוי ≈ מס דצמבר 5,000
    expect(by.incomeTaxPayable.closing).toBe(10_000_00);
    expect(by.incomeTaxPayable.expectedClosing).toBe(5_000_00);
    expect(by.fundsPayable.status).toBe("na");
  });

  it("reports a difference and an unmapped group", () => {
    const mapping = { ...suggestPayrollAccounts(accounts), salaryExpense: ["6010"], niPayable: [] as string[] };
    const rows = reconcilePayrollToLedger(file, accounts, lines, mapping, { from: "2025-01-01", to: "2025-12-31", tolerance: 100_00 });
    const by = Object.fromEntries(rows.map((r) => [r.group, r]));
    expect(by.salaryExpense.status).toBe("diff");
    expect(by.salaryExpense.diff).toBe(-600_000_00);
    expect(by.niPayable.status).toBe("unmapped");
  });
});
