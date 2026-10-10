import {
  type AnyPgColumn,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * מודל רב־עסקי (multi-tenant): כל רשומה שייכת לעסק (organization),
 * וכל גישה לנתונים חייבת לעבור דרך מזהה העסק.
 * סכומים — באגורות (integer).
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const orgRef = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  businessType: text("business_type").notNull(),
  taxId: text("tax_id").notNull(),
  vatFrequency: text("vat_frequency").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** scrypt — הסיסמה עצמה לא נשמרת לעולם */
  passwordHash: text("password_hash").notNull(),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
  /** אימות דו־שלבי: הסוד מוצפן (AES-GCM). קיים בלי totpEnabledAt = הגדרה שעוד לא אושרה */
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** hash של קודי הגיבוי שעוד לא נוצלו */
  backupCodes: jsonb("backup_codes"),
  /** קודי אימות שגויים ברצף — נספרים בנפרד מהסיסמה, כדי שכניסה בסיסמה נכונה לא תאפס אותם */
  totpFailures: integer("totp_failures").notNull().default(0),
});

/** כניסה שעברה סיסמה ומחכה לקוד האימות הדו־שלבי. בעוגייה הטוקן; כאן רק ה־hash שלו */
export const pendingLogins = pgTable("pending_logins", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/**
 * סשנים בצד השרת. בעוגייה נשמר טוקן אקראי; בטבלה נשמר רק ה־hash שלו,
 * כך שדליפת מסד הנתונים לא מאפשרת להתחבר בשם משתמשים.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** משתמש יכול להיות שייך לכמה עסקים (למשל יועץ שמנהל כמה לקוחות) */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | accountant | viewer
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.organizationId, t.userId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    organizationId: orgRef(),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    isVatRegistered: boolean("is_vat_registered").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_org").on(t.organizationId)],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    organizationId: orgRef(),
    type: text("type").notNull(),
    number: integer("number").notNull(),
    issueDate: date("issue_date").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    /** צילום פרטי הלקוח ביום ההפקה — מסמך שהופק לא משתנה */
    customerName: text("customer_name").notNull(),
    customerTaxId: text("customer_tax_id"),
    net: integer("net").notNull(),
    vat: integer("vat").notNull(),
    gross: integer("gross").notNull(),
    vatRate: doublePrecision("vat_rate").notNull(),
    allocationRequired: boolean("allocation_required").notNull().default(false),
    allocationNumber: text("allocation_number"),
    notes: text("notes"),
    /** מתי הופק ה"מקור". כל הפקה אחריו מסומנת "העתק נאמן למקור" */
    originalDeliveredAt: timestamp("original_delivered_at", { withTimezone: true }),
    /** לחשבונית / חשבון עסקה: מתי שולמו, ואיך זה נקבע — bank | receipt | manual */
    paidAt: date("paid_at"),
    paidVia: text("paid_via"),
    /** קבלה על חשבונית, או חשבונית מס קבלה על חשבון עסקה */
    relatedDocumentId: uuid("related_document_id").references((): AnyPgColumn => documents.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("documents_org_type_number").on(t.organizationId, t.type, t.number),
    index("documents_org_date").on(t.organizationId, t.issueDate),
  ],
);

export const documentLines = pgTable("document_lines", {
  id: id(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  lineNet: integer("line_net").notNull(),
});

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    organizationId: orgRef(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    taxDeductiblePct: doublePrecision("tax_deductible_pct").notNull(),
    vatDeductiblePct: doublePrecision("vat_deductible_pct").notNull(),
  },
  (t) => [uniqueIndex("expense_categories_org_key").on(t.organizationId, t.key)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    organizationId: orgRef(),
    date: date("date").notNull(),
    supplierName: text("supplier_name").notNull(),
    supplierTaxId: text("supplier_tax_id"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    description: text("description"),
    referenceNumber: text("reference_number"),
    net: integer("net").notNull(),
    vat: integer("vat").notNull(),
    gross: integer("gross").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_org_date").on(t.organizationId, t.date)],
);

/** יומן פעולות — חובה לצורך הוראות ניהול ספרים ולביקורת */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: orgRef(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    at: createdAt(),
  },
  (t) => [index("audit_org_at").on(t.organizationId, t.at)],
);

/** תנועות שיובאו מקובץ הבנק, וההתאמה שלהן למסמכים ולהוצאות */
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: id(),
    organizationId: orgRef(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    /** חיובי — זיכוי; שלילי — חובה. באגורות */
    amount: integer("amount").notNull(),
    balance: integer("balance"),
    reference: text("reference"),
    fingerprint: text("fingerprint").notNull(),
    /** unmatched | matched | ignored */
    status: text("status").notNull().default("unmatched"),
    matchedDocumentId: uuid("matched_document_id").references(() => documents.id),
    matchedExpenseId: uuid("matched_expense_id").references(() => expenses.id),
    importedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bank_tx_org_fingerprint").on(t.organizationId, t.fingerprint),
    index("bank_tx_org_date").on(t.organizationId, t.date),
  ],
);

/** קישורי איפוס סיסמה. נשמר רק ה־hash של הטוקן, והוא בתוקף לזמן קצר */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_user").on(t.userId)],
);

/** תיעוד כל מייל שהמערכת שלחה (או סימלצה כשאין ספק מוגדר) */
export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    /** sent | simulated | failed */
    status: text("status").notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_org").on(t.organizationId, t.createdAt), index("email_log_document").on(t.documentId)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => Buffer.from(value),
});

/**
 * קבלות וחשבוניות ספק שהועלו. חובה לשמור את המסמכים המקוריים לפי הוראות ניהול ספרים.
 * (בהמשך יעברו לאחסון קבצים ייעודי; כרגע נשמרים ב־DB)
 */
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    organizationId: orgRef(),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    /** none | done | failed */
    extractionStatus: text("extraction_status").notNull().default("none"),
    extracted: jsonb("extracted"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("receipts_org").on(t.organizationId, t.createdAt), index("receipts_expense").on(t.expenseId)],
);

/** תיק ביקורת: לקוח מבוקר ושנת דוח, בתוך משרד רואי החשבון (organization) */
export const auditEngagements = pgTable(
  "audit_engagements",
  {
    id: id(),
    organizationId: orgRef(),
    clientName: text("client_name").notNull(),
    clientTaxId: text("client_tax_id"),
    fiscalYear: integer("fiscal_year").notNull(),
    yearEnd: date("year_end").notNull(),
    materialityBasis: text("materiality_basis"),
    materialityBase: integer("materiality_base"),
    materialityPct: doublePrecision("materiality_pct"),
    sampleSeed: integer("sample_seed").notNull(),
    sourceFilename: text("source_filename"),
    /** מקור הנתונים: csv | uniform; ולמבנה אחיד — פרטי התוכנה, העסק והתקופה מתוך INI.TXT */
    sourceType: text("source_type"),
    sourceMeta: jsonb("source_meta"),
    /** בעיות שלמות שנמצאו בקבצים עצמם */
    importIssues: jsonb("import_issues"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    /** נתוני השנה הקודמת (להשוואה בסקירה האנליטית): קובץ, סוג, מועד ובעיות */
    priorSource: jsonb("prior_source"),
    /** בחירת החשבונות לבדיקת סבירות המע"מ: { revenueAccounts, outputVatAccounts } */
    vatConfig: jsonb("vat_config"),
    /** מיפוי חשבונות השכר בספרים לקבוצות (הוצאות שכר, ב"ל מעביד, מוסדות…) להתאמת שכר ↔ ספרים */
    payrollConfig: jsonb("payroll_config"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("audit_engagements_org").on(t.organizationId, t.fiscalYear)],
);

export const auditAccounts = pgTable(
  "audit_accounts",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    /** current = שנת הדוח; prior = השנה הקודמת להשוואה */
    period: text("period").notNull().default("current"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    openingBalance: integer("opening_balance").notNull().default(0),
    /** מהמבנה האחיד: קוד וקבוצה במאזן הבוחן, וקוד סיווג חשבונאי (טופס 6111) */
    trialBalanceCode: text("trial_balance_code"),
    trialBalanceName: text("trial_balance_name"),
    classification: text("classification"),
  },
  (t) => [uniqueIndex("audit_accounts_engagement_period_code").on(t.engagementId, t.period, t.code)],
);

export const auditLines = pgTable(
  "audit_lines",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    period: text("period").notNull().default("current"),
    entryId: text("entry_id").notNull(),
    date: date("date").notNull(),
    accountCode: text("account_code").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
  },
  (t) => [index("audit_lines_engagement").on(t.engagementId, t.period, t.date)],
);

/** הסברים ותיעוד של רואה החשבון לממצאים בתיק (ראשית ניירות העבודה) */
export const auditNotes = pgTable(
  "audit_notes",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    /** מזהה הממצא, למשל analytics:a:4000 או spike:4000:2025-12 */
    itemKey: text("item_key").notNull(),
    text: text("text").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("audit_notes_engagement_item").on(t.engagementId, t.itemKey)],
);

/** דף בנק שנקלט לתיק לצורך התאמת בנק, לכל חשבון בנק בספרים */
export const auditBankStatements = pgTable(
  "audit_bank_statements",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    accountCode: text("account_code").notNull(),
    filename: text("filename").notNull(),
    /** שורות דף הבנק (תאריך, תיאור, סכום, יתרה, אסמכתא) */
    rows: jsonb("rows").notNull(),
    /** יתרת בנק ליום הסיום שהוזנה ידנית (גוברת על היתרה שבקובץ) */
    balanceOverride: integer("balance_override"),
    importedAt: createdAt(),
  },
  (t) => [uniqueIndex("audit_bank_statements_account").on(t.engagementId, t.accountCode)],
);

/** נתוני השכר של הלקוח המבוקר לשנת הדוח, מקובץ 126 (ובעתיד גם מריכוז שכר): עובדים, חודשים, סיכומים ובעיות בקובץ */
export const auditPayroll = pgTable(
  "audit_payroll",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    sourceType: text("source_type").notNull().default("form126"),
    employer: jsonb("employer").notNull(),
    employees: jsonb("employees").notNull(),
    months: jsonb("months").notNull(),
    declared: jsonb("declared").notNull(),
    issues: jsonb("issues").notNull(),
    importedAt: createdAt(),
  },
  (t) => [uniqueIndex("audit_payroll_engagement").on(t.engagementId)],
);

/** ריכוז שכר / תלושים חודשיים (אקסל או CSV) כפי שנקלט: כותרות, שורות ומיפוי העמודות לשדות הקנוניים */
export const auditPayslips = pgTable(
  "audit_payslips",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    sheet: text("sheet"),
    headers: jsonb("headers").notNull(),
    rows: jsonb("rows").notNull(),
    /** { field: columnIndex } — ניתן לתיקון בלי העלאה מחדש */
    mapping: jsonb("mapping").notNull(),
    importedAt: createdAt(),
  },
  (t) => [uniqueIndex("audit_payslips_engagement").on(t.engagementId)],
);

/** תשלומי שכר בפועל (פירוט זיכויי מס"ב / העברות משכורת, אקסל או CSV): כותרות, שורות ומיפוי — כמו התלושים */
export const auditPayments = pgTable(
  "audit_payments",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    sheet: text("sheet"),
    headers: jsonb("headers").notNull(),
    rows: jsonb("rows").notNull(),
    mapping: jsonb("mapping").notNull(),
    importedAt: createdAt(),
  },
  (t) => [uniqueIndex("audit_payments_engagement").on(t.engagementId)],
);

/**
 * נייר עבודה לכל תחום בתיק: מסקנה, מי הכין ומתי, מי סקר ומתי.
 * כל שינוי במסקנה מבטל את הסקירה; הסוקר חייב להיות אדם אחר ממי שהכין.
 */
export const auditWorkpapers = pgTable(
  "audit_workpapers",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => auditEngagements.id, { onDelete: "cascade" }),
    /** tb / je / analytics / recon / benford / sample / payroll */
    area: text("area").notNull(),
    conclusion: text("conclusion").notNull(),
    preparedBy: uuid("prepared_by").references(() => users.id, { onDelete: "set null" }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("audit_workpapers_engagement_area").on(t.engagementId, t.area)],
);
