import { describe, expect, it } from "vitest";
import {
  BankParseError,
  decodeBankFile,
  detectColumns,
  fingerprints,
  parseBankAmount,
  parseBankDate,
  parseBankStatement,
  parseCsv,
} from "./parse";

describe("bank parsing helpers", () => {
  it("parses amounts in bank formats", () => {
    expect(parseBankAmount("1,234.50")).toBe(123450);
    expect(parseBankAmount("-1,234.50")).toBe(-123450);
    expect(parseBankAmount("(99.90)")).toBe(-9990);
    expect(parseBankAmount("250.00-")).toBe(-25000);
    expect(parseBankAmount("₪ 12")).toBe(1200);
    expect(parseBankAmount("")).toBeNull();
    expect(parseBankAmount("abc")).toBeNull();
  });

  it("parses dates and rejects impossible ones", () => {
    expect(parseBankDate("05/10/2026")).toBe("2026-10-05");
    expect(parseBankDate("5.10.26")).toBe("2026-10-05");
    expect(parseBankDate("2026-10-05")).toBe("2026-10-05");
    expect(parseBankDate("31/02/2026")).toBeNull();
    expect(parseBankDate("יתרת פתיחה")).toBeNull();
  });

  it("handles quoted CSV fields and detects the delimiter", () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([
      ["a", "b, c", 'd "q"'],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
    // מרכאות באמצע שדה (ש"ח, בע"מ) הן טקסט רגיל ולא פותחות שדה מצוטט
    expect(parseCsv('יתרה בש"ח,ספק בע"מ\n1,2')).toEqual([
      ['יתרה בש"ח', 'ספק בע"מ'],
      ["1", "2"],
    ]);
  });

  it("decodes Windows-1255 files", () => {
    const bytes = new Uint8Array([0xfa, 0xe0, 0xf8, 0xe9, 0xea]); // "תאריך"
    expect(decodeBankFile(bytes)).toBe("תאריך");
    expect(decodeBankFile(new TextEncoder().encode("﻿תאריך"))).toBe("תאריך");
  });

  it("detects columns from Hebrew headers", () => {
    expect(detectColumns(["תאריך", "תאריך ערך", "הפעולה", "אסמכתא", "חובה", "זכות", "יתרה בש\"ח"])).toEqual({
      date: 0,
      description: 2,
      reference: 3,
      debit: 4,
      credit: 5,
      balance: 6,
    });
  });
});

describe("parseBankStatement", () => {
  it("reads a debit/credit statement with preamble and summary rows", () => {
    const csv = [
      "חשבון 12-345-678901",
      "תנועות בין 01/09/2026 ל-30/09/2026",
      "",
      "תאריך,הפעולה,אסמכתא,חובה,זכות,יתרה",
      "01/09/2026,יתרת פתיחה,,,,10000.00",
      '03/09/2026,העברה מחברת הדוגמה,1234,,"4,720.00","14,720.00"',
      "05/09/2026,פז תחנת דלק,5555,590.00,,14130.00",
      "05/09/2026,קפה,7777,15.00,,14115.00",
      ",סה\"כ,,605.00,4720.00,",
    ].join("\n");
    const { rows, skipped } = parseBankStatement(csv);
    expect(rows).toEqual([
      { date: "2026-09-03", description: "העברה מחברת הדוגמה", amount: 472000, balance: 1472000, reference: "1234" },
      { date: "2026-09-05", description: "פז תחנת דלק", amount: -59000, balance: 1413000, reference: "5555" },
      { date: "2026-09-05", description: "קפה", amount: -1500, balance: 1411500, reference: "7777" },
    ]);
    expect(skipped).toBe(2);
  });

  it("reads a statement with a value-date column and Hebrew abbreviations", () => {
    const text = [
      "תאריך,תאריך ערך,הפעולה,אסמכתא,חובה,זכות,יתרה בש\"ח",
      '03/09/2026,04/09/2026,העברה מחברת הדוגמה בע"מ,1234,,"4,720.00","14,720.00"',
    ].join("\r\n");
    const { rows } = parseBankStatement(text);
    expect(rows).toEqual([
      { date: "2026-09-03", description: 'העברה מחברת הדוגמה בע"מ', amount: 472000, balance: 1472000, reference: "1234" },
    ]);
  });

  it("reads a single signed amount column", () => {
    const { rows } = parseBankStatement("תאריך;תיאור;סכום\n2026-09-03;שכר דירה;-3500\n2026-09-04;תשלום לקוח;1200");
    expect(rows.map((r) => r.amount)).toEqual([-350000, 120000]);
  });

  it("explains unrecognized files", () => {
    expect(() => parseBankStatement("name,price\nfoo,1")).toThrow(BankParseError);
  });

  it("gives identical rows different fingerprints", () => {
    const row = { date: "2026-09-05", description: "קפה", amount: -1500, balance: null, reference: null };
    const [a, b] = fingerprints([row, row]);
    expect(a).not.toBe(b);
    expect(fingerprints([row])[0]).toBe(a);
  });
});
