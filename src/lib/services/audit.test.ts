import { describe, expect, it } from "vitest";
import { registerUser } from "./auth";
import { createOrganization } from "./organizations";
import { buildFile, encode1255, OSEK } from "@/test/uniform-fixture";
import {
  listNotes,
  saveNote,
  createEngagement,
  getEngagement,
  importLedger,
  listEngagements,
  loadEngagementLedger,
  redrawSample,
  setMateriality,
} from "./audit";

async function firm(email: string) {
  const user = await registerUser({ email, name: "רו\"ח", password: "correct horse battery" });
  const org = await createOrganization({ ownerUserId: user.id, name: "משרד רו\"ח", taxId: "123456782" });
  return { user, org };
}

const LEDGER = [
  "תאריך,מספר תנועה,חשבון,שם חשבון,פרטים,חובה,זכות",
  "05/03/2026,1,1000,קופה,מכירה,1180,",
  "05/03/2026,1,4000,הכנסות,מכירה,,1000",
  "05/03/2026,1,2200,מע\"מ עסקאות,מכירה,,180",
].join("\n");
const enc = (s: string) => new TextEncoder().encode(s);

describe("audit engagements", () => {
  it("creates an engagement, imports and re-imports a ledger", async () => {
    const { user, org } = await firm("audit1@example.com");
    await expect(createEngagement(org.id, user.id, { clientName: "", fiscalYear: 2026 })).rejects.toThrow(/שם/);
    await expect(createEngagement(org.id, user.id, { clientName: "x", clientTaxId: "123456789", fiscalYear: 2026 })).rejects.toThrow(/לא תקין/);
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח בע\"מ", clientTaxId: "515555555", fiscalYear: 2026 });
    expect(e.yearEnd).toBe("2026-12-31");

    expect(await importLedger(org.id, e.id, { name: "gl.csv", bytes: enc(LEDGER) })).toMatchObject({
      accounts: 3,
      lines: 3,
      skipped: 0,
      sourceType: "csv",
    });
    // קליטה חוזרת מחליפה ולא מכפילה
    await importLedger(org.id, e.id, { name: "gl2.csv", bytes: enc(LEDGER) });
    const loaded = await loadEngagementLedger(org.id, e.id);
    expect(loaded?.lines).toHaveLength(3);
    expect(loaded?.engagement.sourceFilename).toBe("gl2.csv");
    expect((await listEngagements(org.id))[0].lineCount).toBe(3);
  });

  it("imports uniform-format files and records integrity issues and the client mismatch", async () => {
    const { user, org } = await firm("audit5@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", clientTaxId: "123456782", fiscalYear: 2025 });
    await expect(importLedger(org.id, e.id, [{ name: "INI.TXT", bytes: encode1255("A000") }])).rejects.toThrow(/BKMVDATA/);
    const r = await importLedger(org.id, e.id, [{ name: "BKMVDATA.TXT", bytes: encode1255(buildFile({ declared: 99 })) }]);
    expect(r).toMatchObject({ sourceType: "uniform", accounts: 3, lines: 3 });
    const messages = r.issues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(new RegExp(`מספר העוסק בקובץ \\(${OSEK}\\)`));
    expect(messages).toMatch(/מצהירה על 99/);
    expect(messages).toMatch(/לא נבחר INI.TXT/);
    const loaded = await loadEngagementLedger(org.id, e.id);
    expect(loaded?.engagement.sourceType).toBe("uniform");
    expect(loaded?.lines.map((l) => l.amount)).toEqual([118000, -100000, -18000]);
  });

  it("keeps prior-year data separate from the current year", async () => {
    const { user, org } = await firm("audit6@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await importLedger(org.id, e.id, { name: "2026.csv", bytes: enc(LEDGER) });
    const prior = LEDGER.replace(/05\/03\/2026/g, "05/03/2025").replace("1180,", "590,").replace(",,1000", ",,500").replace(",,180", ",,90");
    await importLedger(org.id, e.id, { name: "2024.csv", bytes: enc(prior) }, "prior");
    // קליטה חוזרת של השנה הקודמת לא נוגעת בשנה הנוכחית
    await importLedger(org.id, e.id, { name: "2024b.csv", bytes: enc(prior) }, "prior");
    const loaded = await loadEngagementLedger(org.id, e.id);
    expect(loaded?.lines.map((l) => l.amount)).toEqual([118000, -100000, -18000]);
    expect(loaded?.prior.lines.map((l) => l.amount)).toEqual([59000, -50000, -9000]);
    // שנה לא נכונה: קובץ 2024 שנקלט כשנת הדוח 2025
    const wrong = await importLedger(org.id, e.id, { name: "oops.csv", bytes: enc(prior) });
    expect(wrong.issues[0].message).toMatch(/אינן משנת 2026/);
    expect(loaded?.engagement.sourceFilename).toBe("2026.csv");
    expect((loaded?.engagement.priorSource as { filename: string }).filename).toBe("2024b.csv");
  });

  it("saves, updates and deletes notes, scoped to the firm", async () => {
    const a = await firm("audit7@example.com");
    const b = await firm("audit8@example.com");
    const e = await createEngagement(a.org.id, a.user.id, { clientName: "לקוח", fiscalYear: 2025 });
    await saveNote(a.org.id, e.id, "analytics:a:4000", "גידול במכירות בעקבות לקוח חדש — נבדק מול חוזה", a.user.id);
    await saveNote(a.org.id, e.id, "analytics:a:4000", "עודכן", a.user.id);
    expect((await listNotes(a.org.id, e.id)).get("analytics:a:4000")).toMatchObject({ text: "עודכן", author: 'רו"ח' });
    await expect(saveNote(b.org.id, e.id, "analytics:a:4000", "x", b.user.id)).rejects.toThrow(/לא נמצא/);
    expect((await listNotes(b.org.id, e.id)).size).toBe(0);
    await expect(saveNote(a.org.id, e.id, "bad key", "x", a.user.id)).rejects.toThrow(/מזהה/);
    await saveNote(a.org.id, e.id, "analytics:a:4000", "   ", a.user.id);
    expect((await listNotes(a.org.id, e.id)).size).toBe(0);
  });

  it("validates materiality and records sample redraws", async () => {
    const { user, org } = await firm("audit2@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await expect(setMateriality(org.id, e.id, { basis: "revenue", base: 0, pct: 1 })).rejects.toThrow(/חיובי/);
    await setMateriality(org.id, e.id, { basis: "revenue", base: 100000000, pct: 1 });
    expect((await getEngagement(org.id, e.id))?.materialityBase).toBe(100000000);
    const before = e.sampleSeed;
    await redrawSample(org.id, e.id, user.id);
    expect((await getEngagement(org.id, e.id))?.sampleSeed).not.toBe(before);
  });

  it("keeps firms apart", async () => {
    const a = await firm("audit3@example.com");
    const b = await firm("audit4@example.com");
    const e = await createEngagement(a.org.id, a.user.id, { clientName: "לקוח של א", fiscalYear: 2026 });
    expect(await getEngagement(b.org.id, e.id)).toBeNull();
    expect(await loadEngagementLedger(b.org.id, e.id)).toBeNull();
    await expect(importLedger(b.org.id, e.id, { name: "x.csv", bytes: enc(LEDGER) })).rejects.toThrow(/לא נמצא/);
    await expect(setMateriality(b.org.id, e.id, { basis: "revenue", base: 1, pct: 1 })).rejects.toThrow(/לא נמצא/);
    expect(await listEngagements(b.org.id)).toHaveLength(0);
  });
});

describe("reconciliations", async () => {
  const { importBankStatement, listBankStatements, setStatementBalance, setVatConfig } = await import("./audit");
  const STATEMENT = "תאריך,תיאור,סכום,יתרה\n05/03/2026,הפקדה,1180,1180.00";

  it("stores a bank statement per ledger account and validates the account and balance", async () => {
    const { user, org } = await firm("recon1@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await importLedger(org.id, e.id, { name: "gl.csv", bytes: enc(LEDGER) });
    await expect(importBankStatement(org.id, e.id, "9999", { name: "b.csv", bytes: enc(STATEMENT) })).rejects.toThrow(/לא נמצא/);
    expect(await importBankStatement(org.id, e.id, "1000", { name: "b.csv", bytes: enc(STATEMENT) })).toEqual({ rows: 1 });
    await setStatementBalance(org.id, e.id, "1000", 123400);
    // קליטה חוזרת מחליפה את הדף ומאפסת את היתרה הידנית
    await importBankStatement(org.id, e.id, "1000", { name: "b2.csv", bytes: enc(STATEMENT) });
    const [s] = await listBankStatements(org.id, e.id);
    expect(s).toMatchObject({ accountCode: "1000", filename: "b2.csv", balanceOverride: null });
    expect(s.rows[0]).toMatchObject({ date: "2026-03-05", amount: 118000, balance: 118000 });
    await expect(setStatementBalance(org.id, e.id, "4000", 1)).rejects.toThrow(/לא נקלט/);
  });

  it("validates the VAT account selection and keeps firms apart", async () => {
    const a = await firm("recon2@example.com");
    const b = await firm("recon3@example.com");
    const e = await createEngagement(a.org.id, a.user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await importLedger(a.org.id, e.id, { name: "gl.csv", bytes: enc(LEDGER) });
    await expect(setVatConfig(a.org.id, e.id, { revenueAccounts: [], outputVatAccounts: ["2200"] })).rejects.toThrow(/לפחות/);
    await expect(setVatConfig(a.org.id, e.id, { revenueAccounts: ["4000"], outputVatAccounts: ["4000"] })).rejects.toThrow(/גם/);
    await expect(setVatConfig(a.org.id, e.id, { revenueAccounts: ["4000"], outputVatAccounts: ["7777"] })).rejects.toThrow(/לא קיים/);
    await setVatConfig(a.org.id, e.id, { revenueAccounts: ["4000"], outputVatAccounts: ["2200"] });
    expect((await getEngagement(a.org.id, e.id))?.vatConfig).toEqual({ revenueAccounts: ["4000"], outputVatAccounts: ["2200"] });
    await expect(setVatConfig(b.org.id, e.id, { revenueAccounts: ["4000"], outputVatAccounts: ["2200"] })).rejects.toThrow(/לא נמצא/);
    await expect(importBankStatement(b.org.id, e.id, "1000", { name: "x.csv", bytes: enc(STATEMENT) })).rejects.toThrow(/לא נמצא/);
    expect(await listBankStatements(b.org.id, e.id)).toEqual([]);
  });
});

describe("payroll (form 126)", async () => {
  const { importPayroll, loadPayroll, setPayrollConfig } = await import("./audit");
  const { buildForm126 } = await import("@/test/form126-fixture");

  it("imports a 126 file, flags a wrong year, re-imports, and keeps firms apart", async () => {
    const { user, org } = await firm("payroll1@example.com");
    const other = await firm("payroll2@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2025 });
    await expect(importPayroll(org.id, e.id, { name: "x.txt", bytes: enc("not a 126 file") })).rejects.toThrow(/126/);
    const r = await importPayroll(org.id, e.id, { name: "126.txt", bytes: buildForm126() });
    expect(r.employees).toBe(3);
    expect(r.months).toBe(12);
    const loaded = await loadPayroll(org.id, e.id);
    expect(loaded?.file.employees).toHaveLength(3);
    expect(loaded?.filename).toBe("126.txt");
    // קליטה חוזרת מחליפה
    await importPayroll(org.id, e.id, { name: "126b.txt", bytes: buildForm126() });
    expect((await loadPayroll(org.id, e.id))?.filename).toBe("126b.txt");
    // שנה לא נכונה
    const wrongYear = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2024 });
    const w = await importPayroll(org.id, wrongYear.id, { name: "126.txt", bytes: buildForm126() });
    expect(w.issues[0].message).toMatch(/לשנת המס 2025/);
    expect(await loadPayroll(other.org.id, e.id)).toBeNull();
    await expect(importPayroll(other.org.id, e.id, { name: "126.txt", bytes: buildForm126() })).rejects.toThrow(/לא נמצא/);
  });

  it("validates the account mapping", async () => {
    const { user, org } = await firm("payroll3@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2026 });
    await importLedger(org.id, e.id, { name: "gl.csv", bytes: enc(LEDGER) });
    const empty = { salaryExpense: [], niEmployerExpense: [], socialExpense: [], incomeTaxPayable: [], niPayable: [], fundsPayable: [], netWagesPayable: [], vacationProvision: [], severanceLiability: [] };
    await expect(setPayrollConfig(org.id, e.id, { ...empty, salaryExpense: ["9999"] })).rejects.toThrow(/לא קיים/);
    await expect(setPayrollConfig(org.id, e.id, { ...empty, salaryExpense: ["4000"], socialExpense: ["4000"] })).rejects.toThrow(/יותר מקבוצה/);
    await setPayrollConfig(org.id, e.id, { ...empty, salaryExpense: ["4000"] });
    expect(((await getEngagement(org.id, e.id))?.payrollConfig as { salaryExpense: string[] }).salaryExpense).toEqual(["4000"]);
  });
});

describe("payslips (ריכוז שכר)", async () => {
  const { importPayslips, loadPayslips, setPayslipMapping } = await import("./audit");
  const SLIPS = ["ת.ז.,שם,חודש,ברוטו,מס הכנסה,נטו", "123456782,דנה כהן,01/2025,10000,800,8500", "123456782,דנה כהן,02/2025,10000,800,8500"].join("\n");

  it("imports, re-maps without re-upload, and validates the mapping", async () => {
    const { user, org } = await firm("slips1@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2025 });
    await expect(setPayslipMapping(org.id, e.id, { taxId: 0, month: 2, gross: 3, net: 5 })).rejects.toThrow(/לא נקלט/);
    const r = await importPayslips(org.id, e.id, { name: "slips.csv", bytes: enc(SLIPS) });
    expect(r).toMatchObject({ rows: 2, skipped: 0, totalRows: 2 });
    const loaded = await loadPayslips(org.id, e.id);
    expect(loaded?.rows.map((x) => x.month)).toEqual(["2025-01", "2025-02"]);
    expect(loaded?.rows[0].incomeTax).toBe(800_00);
    // מיפוי ידני: מוותרים על המס
    await setPayslipMapping(org.id, e.id, { taxId: 0, name: 1, month: 2, gross: 3, net: 5 });
    expect((await loadPayslips(org.id, e.id))?.rows[0].incomeTax).toBeNull();
    await expect(setPayslipMapping(org.id, e.id, { taxId: 0, month: 0, gross: 3, net: 5 })).rejects.toThrow(/יותר משדה/);
    await expect(setPayslipMapping(org.id, e.id, { taxId: 0, month: 2, gross: 3 })).rejects.toThrow(/חובה/);
    await expect(setPayslipMapping(org.id, e.id, { taxId: 0, month: 2, gross: 3, net: 99 })).rejects.toThrow(/לא קיימת/);
  });

  it("keeps a file whose columns were not recognized, and asks for mapping", async () => {
    const { user, org } = await firm("slips2@example.com");
    const e = await createEngagement(org.id, user.id, { clientName: "לקוח", fiscalYear: 2025 });
    const r = await importPayslips(org.id, e.id, { name: "odd.csv", bytes: enc("A,B,C,D\n1,2,3,4") });
    expect(r.rows).toBe(0);
    expect(r.issues[0].message).toMatch(/לא זוהו עמודות חובה/);
    expect((await loadPayslips(org.id, e.id))?.rows).toEqual([]);
  });
});
