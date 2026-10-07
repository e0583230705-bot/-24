import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyPayslipMapping, autoMapColumns, missingRequiredFields, parsePayslipMonth, parsePayslipTable } from "./payslips";

const HEADERS = ["מס' עובד", "ת.ז.", "שם משפחה", "שם פרטי", "חודש שכר", "תאריך תחילה", "אחוז משרה", "שעות עבודה", "שעות נוספות", "ערך שעה", "שכר יסוד", "ש.נ. ש\"ח", "ברוטו למס", "סה\"כ ברוטו", "מס הכנסה", "ביטוח לאומי", "דמי בריאות", "פנסיה - עובד", "פנסיה - מעסיק", "פיצויים", "קרן השתלמות מעסיק", "נטו לתשלום", "חשבון בנק", "מחלקה"];
const ROW = ["7", "123456782", "כהן", "דנה", "01/2025", "01/03/2020", "100", "182", "10", "60.00", "10,920.00", "750.00", "11,670.00", "11,670.00", "900.00", "420.50", "370.00", "700.20", "758.55", "700.20", "875.25", "9,279.30", "12-345-678901", "פיתוח"];

describe("autoMapColumns", () => {
  it("recognizes common Hebrew payroll headers, specific before generic", () => {
    const m = autoMapColumns(HEADERS);
    expect(m).toMatchObject({
      employeeNo: 0, taxId: 1, lastName: 2, firstName: 3, month: 4, startDate: 5, jobPercent: 6, hours: 7, overtimeHours: 8,
      hourlyRate: 9, baseSalary: 10, overtimePay: 11, taxableGross: 12, gross: 13, incomeTax: 14, niEmployee: 15, healthEmployee: 16,
      pensionEmployee: 17, pensionEmployer: 18, severanceEmployer: 19, studyFundEmployer: 20, net: 21, bankAccount: 22, department: 23,
    });
    expect(missingRequiredFields(m)).toEqual([]);
  });

  it("reports missing required fields", () => {
    expect(missingRequiredFields(autoMapColumns(["שם", "ברוטו", "נטו"]))).toEqual(["taxId", "month"]);
  });
});

describe("parsePayslipMonth", () => {
  it("accepts the common month notations", () => {
    for (const [raw, want] of [["01/2025", "2025-01"], ["1.2025", "2025-01"], ["2025-03", "2025-03"], ["202512", "2025-12"], ["03/25", "2025-03"], ["ינואר 2025", "2025-01"], ["מרץ 25", "2025-03"], ["31/01/2025", "2025-01"], ["45658", "2025-01"]] as const) {
      expect(parsePayslipMonth(raw), raw).toBe(want);
    }
    expect(parsePayslipMonth("7", 2025)).toBe("2025-07");
    expect(parsePayslipMonth("אוקטובר", 2025)).toBe("2025-10");
    expect(parsePayslipMonth("abc")).toBeNull();
  });
});

describe("parsePayslipTable + applyPayslipMapping", () => {
  it("reads a CSV with a title row above the headers and skips a totals row", async () => {
    const csv = ["ריכוז שכר שנתי - 2025", "", HEADERS.join(","), ROW.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","), `,סה"כ,,,,,,,,,,,,"11,670.00",,,,,,,,"9,279.30",,`].join("\n");
    const table = await parsePayslipTable(new TextEncoder().encode(csv), "slips.csv");
    expect(table.headers).toEqual(HEADERS);
    expect(table.rows).toHaveLength(2);
    const r = applyPayslipMapping(table, autoMapColumns(table.headers), 2025);
    expect(r.skipped).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      taxId: "123456782", name: "דנה כהן", month: "2025-01", startDate: "2020-03-01", jobPercent: 100, hours: 182, overtimeHours: 10,
      hourlyRate: 60_00, baseSalary: 10_920_00, overtimePay: 750_00, gross: 11_670_00, incomeTax: 900_00, niEmployee: 420_50, healthEmployee: 370_00,
      pensionEmployer: 758_55, net: 9_279_30, bankAccount: "12-345-678901", department: "פיתוח", line: 1,
    });
  });

  it("reads an xlsx workbook, picking the largest sheet, and reports unparseable months", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["הערות"], ["x"]]), "הסבר");
    const rows = [HEADERS, ROW, [...ROW.slice(0, 4), "02/2025", ...ROW.slice(5)], [...ROW.slice(0, 4), "???", ...ROW.slice(5)]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "ריכוז");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const table = await parsePayslipTable(bytes, "slips.xlsx");
    expect(table.sheet).toBe("ריכוז");
    expect(table.headers[1]).toBe("ת.ז.");
    const r = applyPayslipMapping(table, autoMapColumns(table.headers), 2025);
    expect(r.rows.map((x) => x.month)).toEqual(["2025-01", "2025-02"]);
    expect(r.issues[0].message).toMatch(/חודש שכר שלא זוהה/);
  });

  it("refuses a mapping without required fields", async () => {
    const table = await parsePayslipTable(new TextEncoder().encode("שם,ברוטו,נטו\nא,1,1"), "x.csv");
    expect(() => applyPayslipMapping(table, autoMapColumns(table.headers))).toThrow(/חובה/);
  });
});
