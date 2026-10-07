import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decodeBankFile, parseBankStatement, type BankRow } from "@/lib/domain/bank/parse";
import { parseLedgerCsv } from "@/lib/domain/ledger/import-csv";
import {
  crossCheckIni,
  decodeUniform,
  parseBkmvdata,
  parseIni,
  type IniInfo,
  type UniformIssue,
} from "@/lib/domain/ledger/uniform-format";
import { MATERIALITY_BASES, type MaterialityBasis } from "@/lib/domain/ledger/materiality";
import type { LedgerAccount, LedgerLine } from "@/lib/domain/ledger/types";
import { isValidIsraeliId } from "@/lib/domain/israeli-id";
import { ValidationError } from "./organizations";
import type { PayrollFile } from "@/lib/domain/payroll/types";
import type { PayrollAccountMap } from "@/lib/domain/payroll/ledger-reconciliation";
import type { PayslipColumnMap, PayslipRow } from "@/lib/domain/payroll/payslips";

export const MAX_LEDGER_BYTES = 30 * 1024 * 1024;

export async function createEngagement(
  organizationId: string,
  userId: string,
  input: { clientName: string; clientTaxId?: string; fiscalYear: number },
) {
  const clientName = input.clientName.trim();
  if (!clientName) throw new ValidationError("חסר שם הלקוח המבוקר");
  const taxId = input.clientTaxId?.trim() || null;
  if (taxId && !isValidIsraeliId(taxId)) throw new ValidationError("מספר ח.פ. / עוסק של הלקוח לא תקין");
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 2000 || input.fiscalYear > 2100) {
    throw new ValidationError("שנת דוח לא תקינה");
  }
  const db = await getDb();
  const [engagement] = await db
    .insert(schema.auditEngagements)
    .values({
      organizationId,
      clientName,
      clientTaxId: taxId,
      fiscalYear: input.fiscalYear,
      yearEnd: `${input.fiscalYear}-12-31`,
      sampleSeed: randomInt(1, 2_000_000_000),
      createdBy: userId,
    })
    .returning();
  await db.insert(schema.auditLog).values({
    organizationId,
    action: "create",
    entity: "audit_engagement",
    entityId: engagement.id,
    data: { clientName, fiscalYear: input.fiscalYear, by: userId },
  });
  return engagement;
}

export async function listEngagements(organizationId: string) {
  const db = await getDb();
  return db
    .select({
      engagement: schema.auditEngagements,
      lineCount: sql<number>`count(${schema.auditLines.id})::int`,
    })
    .from(schema.auditEngagements)
    .leftJoin(schema.auditLines, eq(schema.auditLines.engagementId, schema.auditEngagements.id))
    .where(eq(schema.auditEngagements.organizationId, organizationId))
    .groupBy(schema.auditEngagements.id)
    .orderBy(desc(schema.auditEngagements.fiscalYear), asc(schema.auditEngagements.clientName));
}

export async function getEngagement(organizationId: string, id: string) {
  const db = await getDb();
  const [engagement] = await db
    .select()
    .from(schema.auditEngagements)
    .where(and(eq(schema.auditEngagements.id, id), eq(schema.auditEngagements.organizationId, organizationId)));
  return engagement ?? null;
}

const startsWith = (bytes: Uint8Array, code: string) =>
  bytes.byteLength >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === code;

type ImportedAccount = LedgerAccount & { trialBalanceCode?: string; trialBalanceName?: string; classification?: string };

/** מזהה את סוג הקבצים לפי התוכן: INI.TXT מתחיל ב־A000, BKMVDATA.TXT ב־A100, אחרת — כרטסת CSV */
function parseLedgerFiles(files: { name: string; bytes: Uint8Array }[]) {
  const iniFile = files.find((f) => startsWith(f.bytes, "A000"));
  const bkmvFile = files.find((f) => startsWith(f.bytes, "A100"));
  if (iniFile && !bkmvFile) throw new ValidationError("נבחר INI.TXT בלבד — יש לבחור גם את BKMVDATA.TXT מאותה ספרייה");
  if (bkmvFile) {
    const ini: IniInfo | null = iniFile ? parseIni(decodeUniform(iniFile.bytes)) : null;
    const bkmv = parseBkmvdata(decodeUniform(bkmvFile.bytes, ini?.charset ?? undefined));
    const issues: UniformIssue[] = [...bkmv.issues, ...(ini ? crossCheckIni(ini, bkmv) : [])];
    if (!ini) issues.push({ severity: "warning", message: "לא נבחר INI.TXT — לא ניתן לאמת את סיכומי הרשומות" });
    return {
      sourceType: "uniform" as const,
      filename: [bkmvFile.name, iniFile?.name].filter(Boolean).join(" + "),
      accounts: bkmv.accounts as ImportedAccount[],
      lines: bkmv.lines.map((l) => ({
        entryId: l.entryId,
        date: l.date,
        accountCode: l.accountCode,
        amount: l.amount,
        description: l.description,
        reference: l.reference,
      })),
      skipped: 0,
      issues,
      meta: {
        businessTaxId: bkmv.businessTaxId,
        businessName: ini?.businessName ?? null,
        softwareName: ini?.softwareName ?? null,
        softwareRegistration: ini?.softwareRegistration ?? null,
        rangeFrom: ini?.rangeFrom ?? null,
        rangeTo: ini?.rangeTo ?? null,
        counts: bkmv.counts,
      },
    };
  }
  if (files.length !== 1) throw new ValidationError("יש לבחור קובץ כרטסת אחד, או את שני קבצי המבנה האחיד");
  const csv = parseLedgerCsv(decodeBankFile(files[0].bytes));
  return {
    sourceType: "csv" as const,
    filename: files[0].name,
    accounts: csv.accounts as ImportedAccount[],
    lines: csv.lines,
    skipped: csv.skipped,
    issues: [] as UniformIssue[],
    meta: null,
  };
}

/**
 * קליטת ספרי הלקוח לתיק: קבצי מבנה אחיד (BKMVDATA.TXT + INI.TXT) או כרטסת CSV.
 * קליטה חוזרת מחליפה את הנתונים הקודמים (למשל אחרי תיקונים של הלקוח).
 */
export type LedgerPeriod = "current" | "prior";

export async function importLedger(
  organizationId: string,
  engagementId: string,
  input: { name: string; bytes: Uint8Array } | { name: string; bytes: Uint8Array }[],
  period: LedgerPeriod = "current",
) {
  const files = Array.isArray(input) ? input : [input];
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (files.length === 0 || files.some((f) => f.bytes.byteLength === 0)) throw new ValidationError("הקובץ ריק");
  if (files.reduce((s, f) => s + f.bytes.byteLength, 0) > MAX_LEDGER_BYTES) {
    throw new ValidationError("הקבצים גדולים מדי (עד 30MB)");
  }

  const parsed = parseLedgerFiles(files);
  const { accounts, lines, skipped } = parsed;
  const issues = [...parsed.issues];
  // קובץ של שנה אחרת מזו שנבחרה — טעות נפוצה ומסוכנת (השוואה לא נכונה, ביקורת על שנה שגויה)
  const expectedYear = String(period === "prior" ? engagement.fiscalYear - 1 : engagement.fiscalYear);
  const outside = lines.filter((l) => !l.date.startsWith(expectedYear)).length;
  if (lines.length > 0 && outside / lines.length > 0.05) {
    issues.unshift({
      severity: "error",
      message: `${Math.round((outside / lines.length) * 100)}% מהתנועות אינן משנת ${expectedYear} — ייתכן שנבחר קובץ של שנה אחרת`,
    });
  }
  if (parsed.meta && engagement.clientTaxId && parsed.meta.businessTaxId.replace(/^0+/, "") !== engagement.clientTaxId.replace(/^0+/, "")) {
    issues.unshift({
      severity: "error",
      message: `מספר העוסק בקובץ (${parsed.meta.businessTaxId}) שונה ממספר הח.פ. של הלקוח בתיק (${engagement.clientTaxId})`,
    });
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.auditLines)
      .where(and(eq(schema.auditLines.engagementId, engagement.id), eq(schema.auditLines.period, period)));
    await tx
      .delete(schema.auditAccounts)
      .where(and(eq(schema.auditAccounts.engagementId, engagement.id), eq(schema.auditAccounts.period, period)));
    for (let i = 0; i < accounts.length; i += 1000) {
      await tx.insert(schema.auditAccounts).values(
        accounts.slice(i, i + 1000).map((a) => ({
          engagementId: engagement.id,
          period,
          code: a.code,
          name: a.name,
          openingBalance: a.openingBalance,
          trialBalanceCode: a.trialBalanceCode || null,
          trialBalanceName: a.trialBalanceName || null,
          classification: a.classification || null,
        })),
      );
    }
    for (let i = 0; i < lines.length; i += 1000) {
      await tx
        .insert(schema.auditLines)
        .values(lines.slice(i, i + 1000).map((l) => ({ engagementId: engagement.id, period, ...l })));
    }
    await tx
      .update(schema.auditEngagements)
      .set(
        period === "current"
          ? {
              sourceFilename: parsed.filename.slice(0, 200),
              sourceType: parsed.sourceType,
              sourceMeta: parsed.meta,
              importIssues: issues,
              importedAt: new Date(),
            }
          : {
              priorSource: {
                filename: parsed.filename.slice(0, 200),
                type: parsed.sourceType,
                meta: parsed.meta,
                issues,
                importedAt: new Date().toISOString(),
              },
            },
      )
      .where(eq(schema.auditEngagements.id, engagement.id));
    await tx.insert(schema.auditLog).values({
      organizationId,
      action: "import_ledger",
      entity: "audit_engagement",
      entityId: engagement.id,
      data: { period, filename: parsed.filename, source: parsed.sourceType, accounts: accounts.length, lines: lines.length, skipped, issues: issues.length },
    });
  });
  return { accounts: accounts.length, lines: lines.length, skipped, sourceType: parsed.sourceType, issues };
}

async function loadPeriod(engagementId: string, period: LedgerPeriod) {
  const db = await getDb();
  const accounts = await db
    .select({
      code: schema.auditAccounts.code,
      name: schema.auditAccounts.name,
      openingBalance: schema.auditAccounts.openingBalance,
      trialBalanceCode: schema.auditAccounts.trialBalanceCode,
      trialBalanceName: schema.auditAccounts.trialBalanceName,
    })
    .from(schema.auditAccounts)
    .where(and(eq(schema.auditAccounts.engagementId, engagementId), eq(schema.auditAccounts.period, period)));
  const lines: LedgerLine[] = await db
    .select({
      entryId: schema.auditLines.entryId,
      date: schema.auditLines.date,
      accountCode: schema.auditLines.accountCode,
      amount: schema.auditLines.amount,
      description: schema.auditLines.description,
      reference: schema.auditLines.reference,
    })
    .from(schema.auditLines)
    .where(and(eq(schema.auditLines.engagementId, engagementId), eq(schema.auditLines.period, period)))
    .orderBy(asc(schema.auditLines.date));
  return { accounts, lines };
}

export async function loadEngagementLedger(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return null;
  const [current, prior] = await Promise.all([loadPeriod(engagement.id, "current"), loadPeriod(engagement.id, "prior")]);
  return { engagement, accounts: current.accounts, lines: current.lines, prior };
}

/** שמירת הסבר/תיעוד לממצא בתיק. טקסט ריק מוחק את ההסבר */
export async function saveNote(organizationId: string, engagementId: string, itemKey: string, text: string, userId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (!/^[a-z]+:[^\r\n]{1,200}$/.test(itemKey)) throw new ValidationError("מזהה ממצא לא תקין");
  const db = await getDb();
  const clean = text.trim().slice(0, 5000);
  if (!clean) {
    await db
      .delete(schema.auditNotes)
      .where(and(eq(schema.auditNotes.engagementId, engagement.id), eq(schema.auditNotes.itemKey, itemKey)));
    return;
  }
  await db
    .insert(schema.auditNotes)
    .values({ engagementId: engagement.id, itemKey, text: clean, authorId: userId })
    .onConflictDoUpdate({
      target: [schema.auditNotes.engagementId, schema.auditNotes.itemKey],
      set: { text: clean, authorId: userId, updatedAt: new Date() },
    });
}

export async function listNotes(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return new Map<string, { text: string; author: string | null; updatedAt: Date }>();
  const db = await getDb();
  const rows = await db
    .select({
      itemKey: schema.auditNotes.itemKey,
      text: schema.auditNotes.text,
      author: schema.users.name,
      updatedAt: schema.auditNotes.updatedAt,
    })
    .from(schema.auditNotes)
    .leftJoin(schema.users, eq(schema.auditNotes.authorId, schema.users.id))
    .where(eq(schema.auditNotes.engagementId, engagement.id));
  return new Map(rows.map((r) => [r.itemKey, { text: r.text, author: r.author, updatedAt: r.updatedAt }]));
}

export async function setMateriality(
  organizationId: string,
  engagementId: string,
  input: { basis: MaterialityBasis; base: number; pct: number },
) {
  if (!(input.basis in MATERIALITY_BASES)) throw new ValidationError("בסיס מהותיות לא תקין");
  if (!(input.base > 0)) throw new ValidationError("סכום הבסיס חייב להיות חיובי");
  if (!(input.pct > 0 && input.pct <= 20)) throw new ValidationError("האחוז חייב להיות בין 0 ל־20");
  const db = await getDb();
  const updated = await db
    .update(schema.auditEngagements)
    .set({ materialityBasis: input.basis, materialityBase: input.base, materialityPct: input.pct })
    .where(and(eq(schema.auditEngagements.id, engagementId), eq(schema.auditEngagements.organizationId, organizationId)))
    .returning({ id: schema.auditEngagements.id });
  if (updated.length === 0) throw new ValidationError("תיק הביקורת לא נמצא");
}

/** מדגם חדש: seed חדש (הקודם מתועד ביומן, כדי שאפשר יהיה להראות שהמדגם לא "נבחר ידנית") */
export async function redrawSample(organizationId: string, engagementId: string, userId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const seed = randomInt(1, 2_000_000_000);
  await db.update(schema.auditEngagements).set({ sampleSeed: seed }).where(eq(schema.auditEngagements.id, engagement.id));
  await db.insert(schema.auditLog).values({
    organizationId,
    action: "redraw_sample",
    entity: "audit_engagement",
    entityId: engagement.id,
    data: { previousSeed: engagement.sampleSeed, seed, by: userId },
  });
}

const MAX_STATEMENT_ROWS = 200_000;

/** קליטת דף בנק להתאמה מול חשבון בנק בספרים. קליטה חוזרת לאותו חשבון מחליפה את הדף */
export async function importBankStatement(
  organizationId: string,
  engagementId: string,
  accountCode: string,
  file: { name: string; bytes: Uint8Array },
) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const [account] = await db
    .select({ code: schema.auditAccounts.code })
    .from(schema.auditAccounts)
    .where(
      and(
        eq(schema.auditAccounts.engagementId, engagement.id),
        eq(schema.auditAccounts.period, "current"),
        eq(schema.auditAccounts.code, accountCode),
      ),
    );
  if (!account) throw new ValidationError("החשבון לא נמצא בספרים של התיק");
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_LEDGER_BYTES) throw new ValidationError("הקובץ גדול מדי");
  const { rows } = parseBankStatement(decodeBankFile(file.bytes));
  if (rows.length > MAX_STATEMENT_ROWS) throw new ValidationError("יותר מדי שורות בדף הבנק");

  await db
    .insert(schema.auditBankStatements)
    .values({ engagementId: engagement.id, accountCode, filename: file.name.slice(0, 200), rows })
    .onConflictDoUpdate({
      target: [schema.auditBankStatements.engagementId, schema.auditBankStatements.accountCode],
      set: { filename: file.name.slice(0, 200), rows, balanceOverride: null, importedAt: new Date() },
    });
  return { rows: rows.length };
}

export async function setStatementBalance(
  organizationId: string,
  engagementId: string,
  accountCode: string,
  balance: number | null,
) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const updated = await db
    .update(schema.auditBankStatements)
    .set({ balanceOverride: balance })
    .where(
      and(
        eq(schema.auditBankStatements.engagementId, engagement.id),
        eq(schema.auditBankStatements.accountCode, accountCode),
      ),
    )
    .returning({ id: schema.auditBankStatements.id });
  if (updated.length === 0) throw new ValidationError("לא נקלט דף בנק לחשבון הזה");
}

export async function listBankStatements(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.auditBankStatements)
    .where(eq(schema.auditBankStatements.engagementId, engagement.id))
    .orderBy(asc(schema.auditBankStatements.accountCode));
  return rows.map((r) => ({ ...r, rows: r.rows as BankRow[] }));
}

export interface VatConfig {
  revenueAccounts: string[];
  outputVatAccounts: string[];
}

export async function setVatConfig(organizationId: string, engagementId: string, config: VatConfig) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (config.revenueAccounts.length === 0 || config.outputVatAccounts.length === 0) {
    throw new ValidationError("יש לבחור לפחות חשבון הכנסות אחד וחשבון מע״מ עסקאות אחד");
  }
  const db = await getDb();
  const known = new Set(
    (
      await db
        .select({ code: schema.auditAccounts.code })
        .from(schema.auditAccounts)
        .where(and(eq(schema.auditAccounts.engagementId, engagement.id), eq(schema.auditAccounts.period, "current")))
    ).map((a) => a.code),
  );
  const all = [...config.revenueAccounts, ...config.outputVatAccounts];
  if (all.some((c) => !known.has(c))) throw new ValidationError("נבחר חשבון שלא קיים בספרים של התיק");
  if (config.revenueAccounts.some((c) => config.outputVatAccounts.includes(c))) {
    throw new ValidationError("אותו חשבון לא יכול להיות גם הכנסות וגם מע״מ");
  }
  await db.update(schema.auditEngagements).set({ vatConfig: config }).where(eq(schema.auditEngagements.id, engagement.id));
}

// ---------- שכר (קובץ 126) ----------

const MAX_PAYROLL_BYTES = 30 * 1024 * 1024;

/** קליטת קובץ 126 של הלקוח המבוקר לתיק. קליטה חוזרת מחליפה את הקודמת */
export async function importPayroll(organizationId: string, engagementId: string, file: { name: string; bytes: Uint8Array }) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_PAYROLL_BYTES) throw new ValidationError("הקובץ גדול מדי (עד 30MB)");
  const { isForm126, parseForm126, Form126Error } = await import("@/lib/domain/payroll/form126");
  if (!isForm126(file.bytes)) {
    throw new ValidationError("זה לא קובץ 126: מצפים לקובץ טקסט ברשומות באורך 966 תווים שמתחיל ברשומה מובילה מסוג 10");
  }
  let parsed: PayrollFile;
  try {
    parsed = parseForm126(file.bytes);
  } catch (e) {
    if (e instanceof Form126Error) throw new ValidationError(e.message);
    throw e;
  }
  const issues = [...parsed.issues];
  if (parsed.employer.taxYear !== engagement.fiscalYear) {
    issues.unshift({ severity: "error", message: `הקובץ הוא לשנת המס ${parsed.employer.taxYear} ואילו התיק הוא לשנת ${engagement.fiscalYear}` });
  }
  const db = await getDb();
  await db
    .insert(schema.auditPayroll)
    .values({
      engagementId: engagement.id,
      filename: file.name,
      sourceType: "form126",
      employer: parsed.employer,
      employees: parsed.employees,
      months: parsed.months,
      declared: parsed.declared,
      issues,
    })
    .onConflictDoUpdate({
      target: schema.auditPayroll.engagementId,
      set: {
        filename: file.name,
        employer: parsed.employer,
        employees: parsed.employees,
        months: parsed.months,
        declared: parsed.declared,
        issues,
        importedAt: new Date(),
      },
    });
  return { employees: parsed.employees.length, months: parsed.months.length, issues };
}

export async function loadPayroll(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.auditPayroll).where(eq(schema.auditPayroll.engagementId, engagement.id));
  if (!row) return null;
  const file: PayrollFile = {
    employer: row.employer as PayrollFile["employer"],
    employees: row.employees as PayrollFile["employees"],
    months: row.months as PayrollFile["months"],
    declared: row.declared as PayrollFile["declared"],
    issues: row.issues as PayrollFile["issues"],
  };
  return { file, filename: row.filename, importedAt: row.importedAt };
}

/** מיפוי חשבונות השכר בספרים. כל קבוצה — רשימת קודי חשבון; חשבון יכול להופיע בקבוצה אחת בלבד */
export async function setPayrollConfig(organizationId: string, engagementId: string, mapping: PayrollAccountMap) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const known = new Set(
    (
      await db
        .select({ code: schema.auditAccounts.code })
        .from(schema.auditAccounts)
        .where(and(eq(schema.auditAccounts.engagementId, engagement.id), eq(schema.auditAccounts.period, "current")))
    ).map((a) => a.code),
  );
  const seen = new Set<string>();
  for (const codes of Object.values(mapping)) {
    for (const c of codes) {
      if (!known.has(c)) throw new ValidationError("נבחר חשבון שלא קיים בספרים של התיק");
      if (seen.has(c)) throw new ValidationError("אותו חשבון נבחר ליותר מקבוצה אחת");
      seen.add(c);
    }
  }
  await db.update(schema.auditEngagements).set({ payrollConfig: mapping }).where(eq(schema.auditEngagements.id, engagement.id));
}

// ---------- ריכוז שכר / תלושים (אקסל / CSV) ----------

/** קליטת ריכוז שכר. הקובץ נשמר כטבלה גולמית + מיפוי אוטומטי; המיפוי ניתן לתיקון בלי העלאה מחדש */
export async function importPayslips(organizationId: string, engagementId: string, file: { name: string; bytes: Uint8Array }) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  if (file.bytes.byteLength === 0) throw new ValidationError("הקובץ ריק");
  if (file.bytes.byteLength > MAX_PAYROLL_BYTES) throw new ValidationError("הקובץ גדול מדי (עד 30MB)");
  const { parsePayslipTable, autoMapColumns, applyPayslipMapping, missingRequiredFields, PayslipParseError, PAYSLIP_FIELDS } = await import(
    "@/lib/domain/payroll/payslips"
  );
  let table;
  try {
    table = await parsePayslipTable(file.bytes, file.name);
  } catch (e) {
    if (e instanceof PayslipParseError) throw new ValidationError(e.message);
    throw e;
  }
  if (table.rows.length > 50_000) throw new ValidationError("יותר מ־50,000 שורות — לפצל את הקובץ");
  const mapping = autoMapColumns(table.headers);
  const missing = missingRequiredFields(mapping);
  // גם אם חסר מיפוי חובה — שומרים, כדי שרואה החשבון ישלים את המיפוי במסך
  let parsedRows = 0;
  let skipped = 0;
  const issues: { severity: "error" | "warning"; message: string }[] = [];
  if (missing.length === 0) {
    try {
      const r = applyPayslipMapping(table, mapping, engagement.fiscalYear);
      parsedRows = r.rows.length;
      skipped = r.skipped;
      issues.push(...r.issues);
    } catch (e) {
      if (!(e instanceof PayslipParseError)) throw e;
      issues.push({ severity: "error", message: e.message });
    }
  } else {
    issues.push({ severity: "error", message: `לא זוהו עמודות חובה: ${missing.map((f) => PAYSLIP_FIELDS[f].label).join(", ")} — יש להשלים את המיפוי` });
  }
  const db = await getDb();
  const values = { filename: file.name, sheet: table.sheet, headers: table.headers, rows: table.rows, mapping };
  await db
    .insert(schema.auditPayslips)
    .values({ engagementId: engagement.id, ...values })
    .onConflictDoUpdate({ target: schema.auditPayslips.engagementId, set: { ...values, importedAt: new Date() } });
  return { rows: parsedRows, skipped, totalRows: table.rows.length, mapped: Object.keys(mapping).length, headers: table.headers.length, issues };
}

export async function loadPayslips(organizationId: string, engagementId: string) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.auditPayslips).where(eq(schema.auditPayslips.engagementId, engagement.id));
  if (!row) return null;
  const { applyPayslipMapping, missingRequiredFields, PayslipParseError } = await import("@/lib/domain/payroll/payslips");
  const table = { headers: row.headers as string[], rows: row.rows as string[][], sheet: row.sheet };
  const mapping = row.mapping as PayslipColumnMap;
  let rows: PayslipRow[] = [];
  let skipped = 0;
  const issues: { severity: "error" | "warning"; message: string }[] = [];
  if (missingRequiredFields(mapping).length === 0) {
    try {
      const r = applyPayslipMapping(table, mapping, engagement.fiscalYear);
      rows = r.rows;
      skipped = r.skipped;
      issues.push(...r.issues);
    } catch (e) {
      if (!(e instanceof PayslipParseError)) throw e;
      issues.push({ severity: "error", message: e.message });
    }
  }
  return { table, mapping, rows, skipped, issues, filename: row.filename, importedAt: row.importedAt };
}

export async function setPayslipMapping(organizationId: string, engagementId: string, mapping: PayslipColumnMap) {
  const engagement = await getEngagement(organizationId, engagementId);
  if (!engagement) throw new ValidationError("תיק הביקורת לא נמצא");
  const db = await getDb();
  const [row] = await db.select({ headers: schema.auditPayslips.headers }).from(schema.auditPayslips).where(eq(schema.auditPayslips.engagementId, engagement.id));
  if (!row) throw new ValidationError("עדיין לא נקלט ריכוז שכר לתיק");
  const width = (row.headers as string[]).length;
  const used = new Set<number>();
  for (const [field, idx] of Object.entries(mapping)) {
    if (idx === undefined) continue;
    if (!Number.isInteger(idx) || idx < 0 || idx >= width) throw new ValidationError(`עמודה לא קיימת עבור ${field}`);
    if (used.has(idx)) throw new ValidationError("אותה עמודה מופתה ליותר משדה אחד");
    used.add(idx);
  }
  const { missingRequiredFields, PAYSLIP_FIELDS } = await import("@/lib/domain/payroll/payslips");
  const missing = missingRequiredFields(mapping);
  if (missing.length) throw new ValidationError(`חסר מיפוי לעמודות חובה: ${missing.map((f) => PAYSLIP_FIELDS[f].label).join(", ")}`);
  await db.update(schema.auditPayslips).set({ mapping }).where(eq(schema.auditPayslips.engagementId, engagement.id));
}
