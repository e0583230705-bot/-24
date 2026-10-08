import { describe, expect, it } from "vitest";
import { checkPayslipRows, comparePayslipsToForm126, payslipMonths } from "./payslip-checks";
import type { PayslipRow } from "./payslips";
import type { PayrollFile } from "./types";

const slip = (over: Partial<PayslipRow> = {}): PayslipRow => ({
  taxId: "123456782", employeeNo: null, name: "דנה כהן", month: "2025-01", startDate: "2020-01-01", endDate: null, jobPercent: 100,
  hours: 182, overtimeHours: 0, hourlyRate: 60_00, baseSalary: 10_920_00, overtimePay: 0, gross: 10_920_00, taxableGross: null, niWages: null,
  incomeTax: 900_00, niEmployee: 440_00, healthEmployee: 400_00, pensionEmployee: 655_20, studyFundEmployee: null, otherDeductions: null,
  totalDeductions: null, net: 10_920_00 - 900_00 - 440_00 - 400_00 - 655_20, pensionEmployer: 709_80, severanceEmployer: 655_20,
  studyFundEmployer: null, niEmployer: null, employerCost: null, recuperationPay: null, vacationBalance: null, sickBalance: null, bankAccount: "12-345-678901",
  department: null, line: 1, ...over,
});
const year = (over: Partial<PayslipRow> = {}) => Array.from({ length: 12 }, (_, i) => slip({ month: `2025-${String(i + 1).padStart(2, "0")}`, line: i + 1, ...over }));

describe("checkPayslipRows", () => {
  it("passes a clean year", () => {
    expect(checkPayslipRows(year())).toEqual([]);
  });

  it("flags net mismatch, below minimum, overtime, and negative amounts", () => {
    const f = checkPayslipRows([
      slip({ net: 5_000_00 }),
      slip({ month: "2025-02", hourlyRate: 30_00, baseSalary: 5_460_00, gross: 5_460_00, net: 4_500_00, incomeTax: 0, niEmployee: 300_00, healthEmployee: 200_00, pensionEmployee: 460_00 }),
      slip({ month: "2025-03", overtimeHours: 80, overtimePay: 4_000_00, gross: 14_920_00, net: 12_524_80 }),
      slip({ month: "2025-04", overtimeHours: 10, overtimePay: 500_00, gross: 11_420_00, net: 9_024_80 }),
      slip({ month: "2025-05", incomeTax: -200_00, net: 10_020_00 + 200_00 - 440_00 - 400_00 - 655_20 + 900_00 }),
    ]);
    const kinds = f.map((x) => x.kind);
    expect(kinds).toContain("ps_net_mismatch");
    expect(kinds).toContain("ps_below_minimum");
    expect(kinds).toContain("ps_overtime_hours");
    expect(kinds).toContain("ps_overtime_rate");
    expect(kinds).toContain("ps_negative");
  });

  it("flags duplicate slips, payment after end, a wage jump and a shared bank account", () => {
    const rows = [
      ...year({ endDate: "2025-06-30" }).slice(0, 8),
      slip({ month: "2025-03", line: 99 }),
      slip({ taxId: "000000018", name: "בן", month: "2025-01", bankAccount: "12-345-678901" }),
      slip({ taxId: "000000026", name: "גל", month: "2025-01", pensionEmployer: 0, severanceEmployer: 0 }),
      slip({ taxId: "000000026", name: "גל", month: "2025-02", pensionEmployer: 0, severanceEmployer: 0 }),
      slip({ taxId: "000000026", name: "גל", month: "2025-03", gross: 30_000_00, net: 25_000_00, pensionEmployer: 0, severanceEmployer: 0 }),
    ];
    const f = checkPayslipRows(rows);
    const by = (k: string) => f.filter((x) => x.kind === k);
    expect(by("ps_duplicate_slip")).toHaveLength(1);
    // סיום 30/6: יולי = גמר חשבון מותר, אוגוסט = ממצא
    expect(by("ps_paid_after_end").map((x) => x.key)).toEqual(["payslip:123456782:2025-08:after"]);
    expect(by("ps_shared_bank")).toHaveLength(1);
    expect(by("ps_no_pension")).toHaveLength(3);
    expect(by("ps_wage_jump").map((x) => x.subject)).toEqual(["000000026"]);
    expect(by("ps_net_mismatch").length).toBeGreaterThan(0);
  });
});

describe("comparePayslipsToForm126", () => {
  const file: PayrollFile = {
    employer: { deductionsFileId: "912345678", name: "x", taxYear: 2025, corporationNo: "00", declaredEmployees: 2, raw: {} },
    employees: [
      { taxId: "123456782", idKind: "israeli", lastName: "כהן", firstName: "דנה", birthDate: null, startDate: null, endDate: null, monthsWorked: 12, jobType: "01", grossWages: 12 * 10_920_00, benefitsInKind: 0, exemptIncome: 0, niWages: 0, taxWithheld: 12 * 900_00, niEmployee: 0, pensionEmployee: 0, pensionEmployer: 0, severanceEmployer: 0, studyFundEmployee: 0, studyFundEmployer: 0, severancePaid: 0, creditPoints: null, raw: {} },
      { taxId: "000000018", idKind: "israeli", lastName: "לוי", firstName: "בן", birthDate: null, startDate: null, endDate: null, monthsWorked: 3, jobType: "01", grossWages: 30_000_00, benefitsInKind: 0, exemptIncome: 0, niWages: 0, taxWithheld: 0, niEmployee: 0, pensionEmployee: 0, pensionEmployer: 0, severanceEmployer: 0, studyFundEmployee: 0, studyFundEmployer: 0, severancePaid: 0, creditPoints: null, raw: {} },
    ],
    months: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, employeeCount: i < 3 ? 2 : 1, wagesTaxable: 10_920_00 + (i < 3 ? 10_000_00 : 0), taxWithheld: 900_00, wagesNi: 0, niTotal: 0, payrollTax: 0, foreignWorkersLevy: 0, raw: {} })),
    declared: { employeeRecords: 2, sums: {}, raw: {} },
    issues: [],
  };

  it("is silent when payslips match the 126 file", () => {
    const rows = [...year(), ...[1, 2, 3].map((m) => slip({ taxId: "000000018", name: "בן לוי", month: `2025-0${m}`, gross: 10_000_00, incomeTax: 0, net: 8_000_00, line: 50 + m }))];
    expect(comparePayslipsToForm126(rows, file, 1_00)).toEqual([]);
    expect(payslipMonths(rows)[0]).toMatchObject({ month: "2025-01", employees: 2, gross: 20_920_00 });
  });

  it("reports monthly gaps, per-employee gaps, and employees only on one side", () => {
    const rows = [...year({ gross: 11_000_00 }), slip({ taxId: "000000034", name: "חדש", month: "2025-05", line: 70 })];
    const f = comparePayslipsToForm126(rows, file, 1_00);
    const kinds = f.map((x) => x.kind);
    expect(kinds.filter((k) => k === "ps_vs_102_month")).toHaveLength(12);
    expect(f.find((x) => x.kind === "ps_vs_126_employee")?.subject).toBe("123456782");
    expect(f.find((x) => x.kind === "ps_only_in_slips")?.subject).toBe("000000034");
    expect(f.find((x) => x.kind === "ps_only_in_126")?.subject).toBe("000000018");
  });
});
