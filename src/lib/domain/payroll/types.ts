import type { Agorot } from "../money";

/**
 * טיפוסים קנוניים לנתוני שכר בתיק ביקורת — בלי תלות במקור (קובץ 126, ריכוז שכר מאקסל, תלושים).
 * סכומים באגורות (integer). תאריכים YYYY-MM-DD, חודשים YYYY-MM.
 */

/** סיכום שנתי לעובד (מקור ראשי: רשומת 20 בקובץ 126) */
export interface PayrollEmployeeYear {
  /** מספר זהות כפי שדווח (9 ספרות עם אפסים מובילים); לעובד זר — מספר דרכון */
  taxId: string;
  /** סוג זיהוי: ת.ז. ישראלית או אחר (דרכון / תושב חוץ) */
  idKind: "israeli" | "other";
  lastName: string;
  firstName: string;
  birthDate: string | null;
  startDate: string | null;
  endDate: string | null;
  /** מספר חודשי העבודה בשנה (1–12) */
  monthsWorked: number;
  /** קוד סוג משרה כפי שבמפרט (01 עיקרי, 02 נוסף, 05 פנסיונר וכו') */
  jobType: string;
  /** שכר ותשלומים (שדות 158/172 בטופס 106) */
  grossWages: Agorot;
  /** שווי הטבות (רכב, טלפון וכו') */
  benefitsInKind: Agorot;
  /** הכנסה פטורה (למשל 9(5)) */
  exemptIncome: Agorot;
  /** שכר חייב בדמי ביטוח לאומי */
  niWages: Agorot;
  taxWithheld: Agorot;
  /** דמי ביטוח לאומי ובריאות שנוכו מהעובד */
  niEmployee: Agorot;
  /** הפקדות עובד לקופת גמל / פנסיה (45א) */
  pensionEmployee: Agorot;
  /** הפקדות מעסיק לתגמולים */
  pensionEmployer: Agorot;
  /** הפקדות מעסיק לפיצויים */
  severanceEmployer: Agorot;
  studyFundEmployee: Agorot;
  studyFundEmployer: Agorot;
  /** פיצויי פיטורים ששולמו (פטור + חייב) */
  severancePaid: Agorot;
  /** נקודות זיכוי (במאיות נקודה, כפי שדווח) */
  creditPoints: number | null;
  /** שדות גולמיים נוספים מהמפרט שלא מופו — לפי מספר השדה, לשקיפות בעת בדיקה */
  raw: Record<string, string>;
}

/** סיכום חודשי (מקור ראשי: רשומת 50 בקובץ 126 = טופס 102 של אותו חודש) */
export interface PayrollMonth {
  /** YYYY-MM */
  month: string;
  employeeCount: number;
  /** סה"כ משכורת ותשלומים חייבים במס הכנסה (102 מ"ה) */
  wagesTaxable: Agorot;
  taxWithheld: Agorot;
  /** סה"כ משכורת חייבת בדמי ביטוח לאומי (102 ב"ל) */
  wagesNi: Agorot;
  /** דמי ביטוח לאומי ובריאות — עובד + מעסיק יחד, כפי שבטופס 102 */
  niTotal: Agorot;
  /** מס שכר (מלכ"ר / מוסד כספי) */
  payrollTax: Agorot;
  /** היטל עובדים זרים */
  foreignWorkersLevy: Agorot;
  raw: Record<string, string>;
}

export interface PayrollEmployer {
  /** מספר תיק ניכויים (9 ספרות) */
  deductionsFileId: string;
  name: string;
  taxYear: number;
  /** מספר אגיד (0 אם אין) */
  corporationNo: string;
  /** מספר העובדים שהוצהר ברשומה המובילה */
  declaredEmployees: number | null;
  /** כתובת, טלפון וכו' — לפי שם השדה במפרט */
  raw: Record<string, string>;
}

/** סיכומים שהצהיר הקובץ (רשומות 30 ו־40) — לבדיקות שלמות מול הרשומות עצמן */
export interface PayrollDeclaredTotals {
  /** מספר רשומות 20 שהוצהר */
  employeeRecords: number | null;
  /** סיכומים לפי שדה: שם שדה → סכום באגורות */
  sums: Record<string, Agorot>;
  raw: Record<string, string>;
}

export interface PayrollIssue {
  severity: "error" | "warning";
  message: string;
}

/** תוצאת קליטה של קובץ 126 */
export interface PayrollFile {
  employer: PayrollEmployer;
  employees: PayrollEmployeeYear[];
  months: PayrollMonth[];
  declared: PayrollDeclaredTotals;
  issues: PayrollIssue[];
}
