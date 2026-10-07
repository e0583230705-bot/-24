import { describe, expect, it } from "vitest";
import { checkEmployees, checkMonths, summarizePayroll } from "./checks";
import type { PayrollEmployeeYear, PayrollFile, PayrollMonth } from "./types";

const emp = (over: Partial<PayrollEmployeeYear> = {}): PayrollEmployeeYear => ({
  taxId: "123456782",
  idKind: "israeli",
  lastName: "כהן",
  firstName: "דנה",
  birthDate: "1990-01-01",
  startDate: "2020-01-01",
  endDate: null,
  monthsWorked: 12,
  jobType: "01",
  grossWages: 120_000_00,
  benefitsInKind: 0,
  exemptIncome: 0,
  niWages: 120_000_00,
  taxWithheld: 12_000_00,
  niEmployee: 8_000_00,
  pensionEmployee: 7_200_00,
  pensionEmployer: 7_800_00,
  severanceEmployer: 10_000_00,
  studyFundEmployee: 0,
  studyFundEmployer: 0,
  severancePaid: 0,
  creditPoints: 225,
  raw: {},
  ...over,
});
const month = (m: number, over: Partial<PayrollMonth> = {}): PayrollMonth => ({
  month: `2025-${String(m).padStart(2, "0")}`,
  employeeCount: 10,
  wagesTaxable: 100_000_00,
  taxWithheld: 10_000_00,
  wagesNi: 100_000_00,
  niTotal: 12_000_00,
  payrollTax: 0,
  foreignWorkersLevy: 0,
  raw: {},
  ...over,
});

describe("checkEmployees", () => {
  it("passes a clean employee", () => {
    expect(checkEmployees([emp()], 2025)).toEqual([]);
  });

  it("flags an invalid ID, a duplicate ID and a foreign ID that is not validated", () => {
    const f = checkEmployees([emp({ taxId: "123456789" }), emp({ taxId: "000000018" }), emp({ taxId: "000000018" }), emp({ taxId: "AB12345", idKind: "other" })], 2025);
    expect(f.filter((x) => x.kind === "invalid_id").map((x) => x.subject)).toEqual(["123456789"]);
    expect(f.filter((x) => x.kind === "duplicate_id").map((x) => x.subject)).toEqual(["000000018"]);
  });

  it("flags wages without deductions, a leaver paid this year and inconsistent dates", () => {
    const f = checkEmployees(
      [
        emp({ taxId: "000000018", taxWithheld: 0, niEmployee: 0, pensionEmployee: 0, pensionEmployer: 0, severanceEmployer: 0 }),
        emp({ taxId: "000000026", endDate: "2024-06-30" }),
        emp({ taxId: "000000034", startDate: "2025-05-01", endDate: "2025-02-01" }),
        emp({ taxId: "000000042", startDate: "2025-10-01", endDate: "2025-12-31", monthsWorked: 6 }),
      ],
      2025,
    );
    const kinds = f.map((x) => x.kind);
    expect(kinds).toContain("no_deductions");
    expect(kinds).toContain("pension_missing");
    expect(kinds).toContain("left_before_year");
    expect(kinds.filter((k) => k === "dates_inconsistent")).toHaveLength(2);
  });

  it("does not demand pension from a new employee in the first 6 months", () => {
    const f = checkEmployees([emp({ startDate: "2025-09-01", monthsWorked: 4, pensionEmployer: 0, severanceEmployer: 0 })], 2025);
    expect(f.map((x) => x.kind)).not.toContain("pension_missing");
  });

  it("flags an outlier only with enough employees", () => {
    const many = Array.from({ length: 12 }, (_, i) => emp({ taxId: String(i).padStart(9, "0"), idKind: "other", grossWages: 100_000_00 }));
    const f = checkEmployees([...many, emp({ taxId: "999999990", idKind: "other", grossWages: 900_000_00 })], 2025);
    expect(f.filter((x) => x.kind === "high_wage_outlier").map((x) => x.subject)).toEqual(["999999990"]);
    expect(checkEmployees([emp(), emp({ taxId: "000000018", grossWages: 900_000_00 })], 2025).map((x) => x.kind)).not.toContain("high_wage_outlier");
  });
});

describe("checkMonths", () => {
  it("accepts 12 months that reconcile to the employees", () => {
    const months = Array.from({ length: 12 }, (_, i) => month(i + 1));
    const employees = Array.from({ length: 10 }, (_, i) => emp({ taxId: String(i).padStart(9, "0"), idKind: "other", grossWages: 120_000_00, taxWithheld: 12_000_00 }));
    expect(checkMonths(months, employees, 2025)).toEqual([]);
  });

  it("flags a missing month, a 102-vs-126 gap, a spike and a headcount jump", () => {
    const months = Array.from({ length: 11 }, (_, i) => month(i + 1));
    months[5] = month(6, { wagesTaxable: 200_000_00, employeeCount: 14 });
    const employees = Array.from({ length: 10 }, (_, i) => emp({ taxId: String(i).padStart(9, "0"), idKind: "other", grossWages: 100_000_00, taxWithheld: 11_000_00 }));
    const kinds = checkMonths(months, employees, 2025).map((x) => x.kind);
    expect(kinds).toContain("month_count");
    expect(kinds).toContain("months_vs_employees");
    expect(kinds).toContain("month_spike");
    expect(kinds).toContain("employee_count_jump");
  });
});

describe("summarizePayroll", () => {
  it("derives the employer NI share from the 102 totals", () => {
    const file: PayrollFile = {
      employer: { deductionsFileId: "912345678", name: "x", taxYear: 2025, corporationNo: "00", declaredEmployees: 1, raw: {} },
      employees: [emp()],
      months: Array.from({ length: 12 }, (_, i) => month(i + 1, { niTotal: 1_500_00 })),
      declared: { employeeRecords: 1, sums: {}, raw: {} },
      issues: [],
    };
    const s = summarizePayroll(file);
    expect(s.niEmployer).toBe(18_000_00 - 8_000_00);
    expect(s.gross).toBe(120_000_00);
    expect(s.activeEmployees).toBe(1);
  });
});
