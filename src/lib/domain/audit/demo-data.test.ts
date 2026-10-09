import { describe, expect, it } from "vitest";
import { demoLedgerCsv, demoPaymentsCsv, demoPayslipsCsv, DEMO_YEAR } from "./demo-data";
import { parseLedgerCsv } from "../ledger/import-csv";
import { applyPayslipMapping, autoMapColumns, parsePayslipTable } from "../payroll/payslips";
import { applyPaymentMapping, autoMapPaymentColumns, reconcilePayments } from "../payroll/payments";
import { collectFindings } from "./findings";
import { buildManagementLetter } from "./management-letter";

const enc = (s: string) => new TextEncoder().encode(s);

describe("demo engagement data", () => {
  it("parses with the real importers and produces the planted findings in every payroll area", async () => {
    const cur = parseLedgerCsv(demoLedgerCsv(DEMO_YEAR));
    const prior = parseLedgerCsv(demoLedgerCsv(DEMO_YEAR - 1));
    expect(cur.lines.length).toBeGreaterThan(70);
    const slipTable = await parsePayslipTable(enc(demoPayslipsCsv()), "slips.csv");
    const slips = applyPayslipMapping(slipTable, autoMapColumns(slipTable.headers), DEMO_YEAR).rows;
    expect(slips).toHaveLength(54);
    const payTable = await parsePayslipTable(enc(demoPaymentsCsv()), "pay.csv");
    const payments = applyPaymentMapping(payTable, autoMapPaymentColumns(payTable.headers), DEMO_YEAR).rows;
    expect(reconcilePayments(slips, payments, { tolerance: 1_00, fiscalYear: DEMO_YEAR }).unmatched).toBe(2);

    const findings = collectFindings({
      fiscalYear: DEMO_YEAR,
      yearEnd: `${DEMO_YEAR}-12-31`,
      current: { accounts: cur.accounts, lines: cur.lines },
      prior: { accounts: prior.accounts, lines: prior.lines },
      materiality: { performance: 15_000_00, trivial: 1_000_00 },
      payroll: null,
      payslips: slips,
      payments,
      payrollMapping: null,
    });
    const kinds = new Set(findings.map((f) => f.kind));
    for (const k of ["ps_below_minimum", "ps_shared_bank", "pay_no_payslip", "pay_amount_mismatch", "pay_not_paid", "prov_no_severance_deposits", "prov_negative_vacation", "prov_vs_books", "je_flagged", "analytics_unexplained"]) {
      expect(kinds, k).toContain(k);
    }
    expect(buildManagementLetter(findings).length).toBeGreaterThanOrEqual(5);
  });
});
