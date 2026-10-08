import { describe, expect, it } from "vitest";
import type { PayslipRow } from "./payslips";
import { applyPaymentMapping, autoMapPaymentColumns, missingPaymentFields, normalizeAccount, reconcilePayments, type PaymentRow } from "./payments";

const slip = (over: Partial<PayslipRow>): PayslipRow => ({
  taxId: "000000018", employeeNo: null, name: "אורית", month: "2025-01", startDate: null, endDate: null, jobPercent: null, hours: null,
  overtimeHours: null, hourlyRate: null, baseSalary: null, overtimePay: null, gross: 10_000_00, taxableGross: null, niWages: null,
  incomeTax: null, niEmployee: null, healthEmployee: null, pensionEmployee: null, studyFundEmployee: null, otherDeductions: null,
  totalDeductions: null, net: 8_000_00, pensionEmployer: null, severanceEmployer: null, studyFundEmployer: null, niEmployer: null,
  employerCost: null, recuperationPay: null, vacationBalance: null, sickBalance: null, bankAccount: "12-345-678901", department: null,
  line: 1, ...over,
});
const pay = (over: Partial<PaymentRow>): PaymentRow => ({ taxId: null, name: "", account: null, amount: 8_000_00, date: null, month: null, reference: null, line: 1, ...over });

describe("normalizeAccount", () => {
  it("normalizes separated and combined account numbers to one key", () => {
    expect(normalizeAccount("12-345-678901")).toBe("12-345-678901");
    expect(normalizeAccount("012/0345/0678901")).toBe("12-345-678901");
    expect(normalizeAccount("0678901", "12", "345")).toBe("12-345-678901");
    expect(normalizeAccount("")).toBeNull();
  });
});

describe("payment file mapping", () => {
  const headers = ["שם המוטב", "בנק", "סניף", "מספר חשבון", "סכום", "תאריך ערך", "אסמכתא"];
  it("recognizes common bank export headers", () => {
    const m = autoMapPaymentColumns(headers);
    expect(m).toEqual({ name: 0, bank: 1, branch: 2, account: 3, amount: 4, date: 5, reference: 6 });
    expect(missingPaymentFields(m)).toEqual([]);
  });
  it("reads rows, skips totals, and builds the account key from bank/branch/account", () => {
    const table = {
      headers,
      sheet: null,
      rows: [
        ["אורית כהן", "12", "345", "678901", "8,000.00", "05/02/2025", "A1"],
        ["סה\"כ", "", "", "", "8,000.00", "", ""],
      ],
    };
    const r = applyPaymentMapping(table, autoMapPaymentColumns(headers), 2025);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toMatchObject({ name: "אורית כהן", account: "12-345-678901", amount: 8_000_00, date: "2025-02-05", reference: "A1" });
  });
  it("requires an amount, a date or month, and a way to identify the payee", () => {
    expect(missingPaymentFields(autoMapPaymentColumns(["שם", "סכום"]))).toEqual(["תאריך או חודש שכר", "מספר זהות או חשבון"]);
  });
});

describe("reconcilePayments", () => {
  const slips = [
    slip({ month: "2025-01" }),
    slip({ month: "2025-02" }),
    slip({ taxId: "000000026", name: "בני", month: "2025-01", net: 5_000_00, bankAccount: "10-800-111111" }),
    slip({ taxId: "000000026", name: "בני", month: "2025-02", net: 5_000_00, bankAccount: "10-800-111111" }),
  ];

  it("matches salary paid early next month by account, and is silent when everything ties", () => {
    const r = reconcilePayments(
      slips,
      [
        pay({ account: "12-345-678901", date: "2025-02-05" }),
        pay({ account: "12-345-678901", date: "2025-03-05" }),
        pay({ account: "10-800-111111", amount: 5_000_00, date: "2025-02-06" }),
        pay({ account: "10-800-111111", amount: 5_000_00, date: "2025-02-28" }),
      ],
      { tolerance: 1_00, fiscalYear: 2025 },
    );
    expect(r.findings).toEqual([]);
    expect(r.matched).toBe(4);
    expect(r.monthly.map((m) => [m.month, m.net, m.paid])).toEqual([
      ["2025-01", 13_000_00, 13_000_00],
      ["2025-02", 13_000_00, 13_000_00],
    ]);
  });

  it("flags ghost payments, wrong amounts, unpaid slips, wrong and shared accounts", () => {
    const r = reconcilePayments(
      slips,
      [
        pay({ taxId: "000000018", account: "12-345-678901", date: "2025-02-05", amount: 8_500_00 }),
        // בני קיבל לחשבון של אורית
        pay({ taxId: "000000026", account: "12-345-678901", amount: 5_000_00, date: "2025-02-06" }),
        // מוטב בלי תלוש
        pay({ name: "רוני", account: "20-100-999999", amount: 7_000_00, date: "2025-02-20" }),
        // ינואר ששילם את דצמבר הקודם — מחוץ לתקופה, לא ממצא
        pay({ name: "ותיק", account: "20-100-555555", amount: 6_000_00, date: "2025-01-05" }),
      ],
      { tolerance: 1_00, fiscalYear: 2025 },
    );
    const kinds = r.findings.map((f) => `${f.kind}:${f.subject}`);
    expect(kinds).toContain("pay_amount_mismatch:000000018");
    expect(kinds).toContain("pay_wrong_account:000000026");
    expect(kinds).toContain("pay_shared_account:12-345-678901");
    expect(kinds).toContain("pay_no_payslip:20-100-999999");
    expect(kinds).toContain("pay_not_paid:000000018");
    expect(kinds).not.toContain("pay_no_payslip:20-100-555555");
    expect(r.outOfRange).toBe(1);
    expect(r.findings.find((f) => f.kind === "pay_amount_mismatch")?.severity).toBe("error");
  });
});
