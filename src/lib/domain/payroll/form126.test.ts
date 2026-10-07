import { describe, expect, it } from "vitest";
import { Form126Error, isForm126, parseForm126, parseForm126Number } from "./form126";
import { FORM126_DATA_LENGTH, FORM126_RECORDS, type Form126Field } from "./form126-fields";
import { buildForm126, buildForm126Text, EMPLOYEES, gross } from "@/test/form126-fixture";
import { encode1255 } from "@/test/uniform-fixture";

describe("טבלאות השדות של קובץ 126", () => {
  // כל רשומה חייבת לכסות את העמודות 1–964 ברצף, בלי חורים ובלי חפיפות — אחרת מיקום אחד לפחות שגוי
  for (const [type, table] of Object.entries(FORM126_RECORDS) as [string, Form126Field[]][]) {
    it(`רשומה ${type} מכסה את כל 964 העמודות ברצף`, () => {
      const sorted = [...table].sort((a, b) => a.from - b.from);
      let expected = 1;
      for (const f of sorted) {
        expect(f.from, `שדה ${f.no} (${f.name}) מתחיל ב־${f.from} במקום ${expected}`).toBe(expected);
        expect(f.to, `שדה ${f.no}`).toBeGreaterThanOrEqual(f.from);
        expected = f.to + 1;
      }
      expect(expected - 1).toBe(FORM126_DATA_LENGTH);
      expect(new Set(table.map((f) => f.no)).size).toBe(table.length);
    });
  }
  it("אין שדות 31 ו־81 ברשומה 20 (המספור במפרט מדלג עליהם)", () => {
    const nos = FORM126_RECORDS["20"].map((f) => f.no);
    expect(nos).not.toContain("31");
    expect(nos).not.toContain("81");
    expect(FORM126_RECORDS["20"].find((f) => f.no === "39")).toMatchObject({ from: 306, to: 315 });
    expect(FORM126_RECORDS["20"].find((f) => f.no === "116")).toMatchObject({ from: 728, to: 736 });
  });
});

describe("מספרים לפי כללי הדיווח", () => {
  it("אפסים מובילים, מינוס בתו השמאלי, ריק = 0", () => {
    expect(parseForm126Number("0000432")).toBe(432);
    expect(parseForm126Number("-000432")).toBe(-432);
    expect(parseForm126Number("        ")).toBe(0);
    expect(parseForm126Number("12a4")).toBeNull();
  });
});

describe("זיהוי קובץ 126", () => {
  it("מזהה קובץ תקין ודוחה קבצים אחרים", () => {
    expect(isForm126(buildForm126())).toBe(true);
    expect(isForm126(encode1255("A100" + " ".repeat(960) + "\r\n"))).toBe(false);
    // רשומה מובילה באורך שגוי
    expect(isForm126(encode1255(buildForm126Text().split("\r\n")[0].slice(0, 500) + "\r\n"))).toBe(false);
  });
  it("זורק שגיאה בעברית לקובץ שאינו 126", () => {
    expect(() => parseForm126(encode1255("A100 something\r\n"))).toThrow(Form126Error);
    expect(() => parseForm126(encode1255("A100 something\r\n"))).toThrow(/אינו קובץ 126/);
  });
});

describe("קליטת קובץ 126 תקין", () => {
  const file = parseForm126(buildForm126());

  it("קורא את המעסיק מהרשומה המובילה", () => {
    expect(file.employer).toMatchObject({ deductionsFileId: "912345678", name: "מפעלי הדוגמה בע\"מ", taxYear: 2025, corporationNo: "00", declaredEmployees: 3 });
    expect(file.employer.raw["16"]).toBe("תל אביב");
  });

  it("קורא את העובדים וממיר שקלים לאגורות", () => {
    expect(file.employees).toHaveLength(3);
    const [e1, e2, e3] = file.employees;
    expect(e1).toMatchObject({
      taxId: "123456782", idKind: "israeli", lastName: "כהן", firstName: "משה", birthDate: "1980-05-15", startDate: "2020-01-01", endDate: null,
      monthsWorked: 12, jobType: "01", grossWages: 120000_00, benefitsInKind: 12000_00, exemptIncome: 0, niWages: 120000_00,
      taxWithheld: 18000_00, niEmployee: 9600_00, pensionEmployee: 7200_00, pensionEmployer: 7800_00, severanceEmployer: 10000_00,
      studyFundEmployee: 3000_00, studyFundEmployer: 9000_00, severancePaid: 0, creditPoints: 225,
    });
    expect(e1.raw["27"]).toBe("00012000");
    expect(e1.raw["24"]).toBe("N");
    expect(e2).toMatchObject({ taxId: "200000008", idKind: "israeli", monthsWorked: 6, grossWages: 60000_00, taxWithheld: 6000_00 });
    expect(e2.raw["24"]).toBe("040509101112");
    expect(e3).toMatchObject({ taxId: "000000018", idKind: "israeli", jobType: "02", grossWages: 30000_00 });
  });

  it("קורא 12 חודשים מרשומות 50", () => {
    expect(file.months).toHaveLength(12);
    expect(file.months[0]).toMatchObject({ month: "2025-01", employeeCount: 2, wagesTaxable: 12500_00, taxWithheld: 2750_00, niTotal: 2500_00, payrollTax: 0, foreignWorkersLevy: 0 });
    expect(file.months[3]).toMatchObject({ month: "2025-04", employeeCount: 3, wagesTaxable: 22500_00, taxWithheld: 3750_00 });
    expect(file.months.reduce((s, m) => s + m.wagesTaxable, 0)).toBe(EMPLOYEES.reduce((s, e) => s + gross(e), 0) * 100);
  });

  it("קורא את הסיכומים המוצהרים", () => {
    expect(file.declared.employeeRecords).toBe(3);
    expect(file.declared.sums.r30_gross_wages).toBe(210000_00);
    expect(file.declared.sums.r30_tax_withheld).toBe(39000_00);
    expect(file.declared.sums.r40_gross_wages).toBe(210000_00);
    expect(file.declared.sums.r40_wages_102_col_d).toBe(210000_00);
    expect(file.declared.sums.r40_ni_102).toBe(42000_00);
    expect(file.declared.raw["40/29"]).toBe("AUDIT@EXAMPLE.CO.IL");
  });

  it("קובץ שמתאים בכל הבדיקות — בלי בעיות", () => {
    expect(file.issues).toEqual([]);
  });
});

describe("בדיקות שלמות", () => {
  const messages = (bytes: Uint8Array) => parseForm126(bytes).issues.map((i) => i.message);

  it("מספר רשומות פרט שונה מההצהרה ברשומה 30", () => {
    expect(messages(buildForm126({ declaredCount: 5 }))).toContainEqual(expect.stringMatching(/מצהירה על 5 רשומות פרט, ובקובץ יש 3/));
  });
  it("צבירת רשומות 20 לא תואמת לרשומה 40", () => {
    const m = messages(buildForm126({ break40Totals: true }));
    expect(m).toContainEqual(expect.stringMatching(/רשומה 40: סה"כ משכורת ותשלומים \(שדה 39\).*210,000.*211,000/));
    // רשומה 30 עדיין תואמת
    expect(m.filter((x) => x.startsWith("רשומה 30"))).toEqual([]);
  });
  it("צבירת החודשים (102) לא תואמת לרשומה 40", () => {
    const m = messages(buildForm126({ breakMonthTotals: true }));
    expect(m).toContainEqual(expect.stringMatching(/^126 מול 102: משכורת ותשלומים לפי טופס 102, טור ד'/));
    expect(m).toContainEqual(expect.stringMatching(/^126 מול 102: ניכוי מס הכנסה/));
  });
  it("חסר חודש", () => {
    const m = messages(buildForm126({ dropMonth: 12 }));
    expect(m).toContainEqual(expect.stringMatching(/חסרות רשומות חודשיות \(50\) לחודשים 12/));
    expect(parseForm126(buildForm126({ dropMonth: 12 })).months).toHaveLength(11);
  });
  it("מספר זהות כפול באותו סוג משרה", () => {
    expect(messages(buildForm126({ duplicateId: true }))).toContainEqual(expect.stringMatching(/123456782 סוג משרה 01/));
  });
  it("מספר זהות עם ספרת ביקורת שגויה", () => {
    const file = parseForm126(buildForm126({ invalidId: true }));
    expect(file.employees[1].idKind).toBe("other");
    expect(file.issues.map((i) => i.message)).toContainEqual(expect.stringMatching(/ספרת ביקורת: 200000001/));
  });
  it("שנת מס שונה בין הרשומה המובילה לרשומות", () => {
    expect(messages(buildForm126({ wrongYearInMonths: true }))).toContainEqual(expect.stringMatching(/שנת המס ברשומה המובילה היא 2025, אבל ב־12 רשומות/));
  });
  it("סוג רשומה לא מוכר", () => {
    expect(messages(buildForm126({ unknownRecord: true }))).toContainEqual(expect.stringMatching(/סוגי רשומה לא מוכרים בקובץ: "77"/));
  });
  it("רשומה באורך שגוי", () => {
    expect(messages(buildForm126({ shortRecord: true }))).toContainEqual(expect.stringMatching(/1 רשומות אינן באורך 964/));
  });
});
