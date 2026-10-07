import type { Agorot } from "../money";
import type { ISODate } from "../vat";

/**
 * ספרי הנהלת חשבונות (כפולה) של לקוח מבוקר, בפורמט פנימי אחיד.
 * כל מקור — קובץ מבנה אחיד, כרטסת מאקסל — מומר לכאן, וכל הבדיקות עובדות על הפורמט הזה.
 * סכומים באגורות; חובה חיובי, זכות שלילי.
 */
export interface LedgerAccount {
  code: string;
  name: string;
  /** יתרת פתיחה: חיובי = חובה */
  openingBalance: Agorot;
}

export interface LedgerLine {
  /** מזהה הפקודה (תנועה). כל השורות של פקודה אחת חייבות להסתכם לאפס */
  entryId: string;
  date: ISODate;
  accountCode: string;
  /** חיובי = חובה, שלילי = זכות */
  amount: Agorot;
  description: string;
  reference: string | null;
}
