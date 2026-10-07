import { describe, expect, it } from "vitest";
import {
  crossCheckIni,
  decodeUniform,
  parseBkmvdata,
  parseIni,
  parseUniformAmount,
  parseUniformDate,
  UniformFormatError,
} from "./uniform-format";
import { b110, buildFile, encode1255, MAIN, OSEK, record } from "@/test/uniform-fixture";

describe("uniform format field parsing", () => {
  it("parses amounts with sign and two implied decimals", () => {
    expect(parseUniformAmount("+00000001234565")).toBe(1234565);
    expect(parseUniformAmount("-00000001234565")).toBe(-1234565);
    expect(parseUniformAmount("")).toBe(0);
    expect(parseUniformAmount("12a")).toBeNull();
  });
  it("parses YYYYMMDD dates", () => {
    expect(parseUniformDate("20251231")).toBe("2025-12-31");
    expect(parseUniformDate("20250230")).toBeNull();
    expect(parseUniformDate("00000000")).toBeNull();
  });
  it("decodes Windows Hebrew and DOS (CP-862) Hebrew", () => {
    expect(decodeUniform(new Uint8Array([0xf9, 0xec, 0xe5, 0xed]))).toBe("שלום");
    expect(decodeUniform(new Uint8Array([0x99, 0x8c, 0x85, 0x8d]))).toBe("שלום");
    expect(decodeUniform(new Uint8Array([0x99, 0x8c]), "cp862")).toBe("של");
    // תוכנות שמייצאות UTF-8 בניגוד למפרט
    expect(decodeUniform(new TextEncoder().encode("A100 שלום"))).toBe("A100 שלום");
  });
});

describe("parseBkmvdata", () => {
  it("reads accounts and journal lines at the specified positions", () => {
    const r = parseBkmvdata(buildFile());
    expect(r.businessTaxId).toBe(String(OSEK));
    expect(r.accounts.map((a) => [a.code, a.name, a.openingBalance, a.classification])).toEqual([
      ["1000", "קופה", 50000, "1000"],
      ["4000", "הכנסות", 0, "1000"],
      ["2200", 'מע"מ עסקאות', 0, "1000"],
    ]);
    expect(r.lines).toEqual([
      expect.objectContaining({ entryId: "17", lineNo: 1, date: "2025-03-05", accountCode: "1000", amount: 118000, description: "מכירה במזומן", reference: "INV-77" }),
      expect.objectContaining({ accountCode: "4000", amount: -100000 }),
      expect.objectContaining({ accountCode: "2200", amount: -18000 }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.counts).toEqual({ A100: 1, B110: 3, B100: 3, Z900: 1 });
  });

  it("reads a real single-byte (Windows-1255) file end to end", () => {
    const r = parseBkmvdata(decodeUniform(encode1255(buildFile())));
    expect(r.accounts[0].name).toBe("קופה");
    expect(r.lines).toHaveLength(3);
    expect(r.issues).toEqual([]);
  });

  it("reports integrity problems in the file itself", () => {
    const broken = parseBkmvdata(buildFile({ breakNumbering: true, declared: 99 }));
    const messages = broken.issues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/מספור הרשומות/);
    expect(messages).toMatch(/מצהירה על 99/);

    const truncated = buildFile().split("\r\n").slice(0, -2).join("\r\n");
    expect(parseBkmvdata(truncated).issues.map((i) => i.message).join()).toMatch(/Z900/);
  });

  it("flags accounts whose reported totals do not match the transactions", () => {
    const file = buildFile().replace(b110(2, "1000", "קופה", 50000, 118000, 0), b110(2, "1000", "קופה", 50000, 999999, 0));
    expect(parseBkmvdata(file).issues.map((i) => i.message).join()).toMatch(/לא תואם לסכום התנועות/);
  });

  it("rejects a file that is not BKMVDATA", () => {
    expect(() => parseBkmvdata("hello")).toThrow(UniformFormatError);
  });
});

describe("compatibility with real exporters", () => {
  // שורות כפי ש־Linet (תוכנת הנה"ח ישראלית בקוד פתוח) כותבת אותן ב־sprintf: שדות טקסט מיושרים לימין עם רווחים,
  // סכום "+%015.2f" בלי הנקודה, ותנועה עם שדה "עתידי" ארוך יותר מבמפרט
  const pad = (v: string | number, w: number) => String(v).padStart(w, " ");
  const zero = (v: number, w: number) => String(v).padStart(w, "0");
  it("reads right-aligned text fields and longer trailing filler", () => {
    const b110 =
      "B110" + zero(2, 9) + zero(OSEK, 9) + pad("101", 15) + pad("קופה ראשית", 50) + pad(1, 15) + pad("נכסים", 30) +
      pad("", 50) + pad("", 10) + pad("", 30) + pad("", 8) + pad("", 30) + pad("", 2) + pad("", 15) +
      "+00000000050000" + "+00000000118000" + "+00000000000000" + zero(0, 4) + zero(0, 9) + pad("", 41);
    const b100 =
      "B100" + zero(3, 9) + zero(OSEK, 9) + zero(42, 10) + zero(1, 5) + zero(0, 8) + pad(1, 15) + pad("77", 20) + zero(400, 3) +
      pad("", 20) + zero(0, 3) + pad("קבלה", 50) + "20250305" + "20250305" + pad("101", 15) + pad("", 15) + "1" + pad("", 3) +
      "+" + "000000001180.00".replace(".", "") + "+" + zero(0, 14) + "+" + zero(0, 11) + pad("", 10) + pad("", 10) + pad("", 7) +
      "20250305" + pad("", 34);
    const file = [
      record(95, [[1, 4, "A100"], [5, 13, 1], [14, 22, OSEK], [23, 37, MAIN], [38, 45, "&OF1.31&"]]),
      b110,
      b100,
      record(110, [[1, 4, "Z900"], [5, 13, 4], [14, 22, OSEK], [23, 37, MAIN], [38, 45, "&OF1.31&"], [46, 60, 4]]),
    ].join("\r\n");
    const r = parseBkmvdata(file);
    expect(r.accounts[0]).toMatchObject({ code: "101", name: "קופה ראשית", openingBalance: 50000, reportedDebits: 118000 });
    expect(r.lines[0]).toMatchObject({ entryId: "42", accountCode: "101", amount: 118000, description: "קבלה", reference: "77" });
    expect(r.issues).toEqual([]);
  });
});

describe("parseIni and cross-check", () => {
  const ini = [
    record(466, [
      [1, 4, "A000"], [10, 24, 8], [25, 33, OSEK], [34, 48, MAIN], [49, 56, "&OF1.31&"], [57, 64, 12345678],
      [65, 84, "תוכנה לדוגמה"], [215, 264, "חברת הדוגמה בע\"מ"], [363, 366, 2025], [367, 374, 20250101],
      [375, 382, 20251231], [396, 396, 1],
    ]),
    record(19, [[1, 4, "B100"], [5, 19, 3]]),
    record(19, [[1, 4, "B110"], [5, 19, 4]]),
  ].join("\r\n");

  it("reads the header and the summary records", () => {
    const info = parseIni(ini);
    expect(info).toMatchObject({
      businessTaxId: String(OSEK),
      mainId: String(MAIN),
      softwareName: "תוכנה לדוגמה",
      businessName: 'חברת הדוגמה בע"מ',
      taxYear: "2025",
      rangeFrom: "2025-01-01",
      rangeTo: "2025-12-31",
      charset: "iso-8859-8",
      counts: { B100: 3, B110: 4 },
    });
  });

  it("finds count mismatches between INI.TXT and BKMVDATA.TXT", () => {
    const issues = crossCheckIni(parseIni(ini), parseBkmvdata(buildFile()));
    expect(issues.map((i) => i.message)).toEqual(["INI.TXT מצהיר על 4 רשומות B110, ובקובץ הנתונים יש 3"]);
  });
});
