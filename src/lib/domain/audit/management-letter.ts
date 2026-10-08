/**
 * טיוטת מכתב הערות להנהלה (Management Letter) מתוך הממצאים בתיק.
 * כל ממצא משויך לנושא לפי סוגו; לכל נושא — מה נמצא (ספירה ודוגמאות), הסיכון וההמלצה.
 * זו טיוטה לעריכת רואה החשבון: הניסוח, ההחלטה מה נכלל והאחריות על המכתב — שלו.
 */

export interface LetterItem {
  /** סוג הממצא (למשל ps_shared_bank) — קובע את הנושא */
  kind: string;
  /** שם סוג הממצא לתצוגה */
  label: string;
  severity: "error" | "warning" | "info";
  message: string;
  key: string;
}

export interface LetterTopic {
  id: string;
  title: string;
  risk: string;
  recommendation: string;
  /** סוגי ממצאים לפי סדר הופעה, עם ספירה */
  kinds: { kind: string; label: string; count: number }[];
  examples: string[];
  total: number;
  /** הנושא מבוסס על ממצא אחד לפחות ברמת "שגיאה" */
  severe: boolean;
}

interface TopicDef {
  title: string;
  risk: string;
  recommendation: string;
  kinds: string[];
}

export const LETTER_TOPICS: Record<string, TopicDef> = {
  ghost: {
    title: "בקרות על קובץ העובדים ועל תשלומי השכר",
    risk: "תשלום שכר לעובד שאינו קיים או שסיים לעבוד, או העברת שכר לחשבון שאינו של העובד — סיכון למעילה ולהפסד כספי.",
    recommendation:
      "מומלץ להפריד בין מי שמעדכן את קובץ העובדים ופרטי החשבונות בתוכנת השכר, מי שמכין את קובץ מס\"ב ומי שמאשר אותו בבנק; לאשר כל שינוי בפרטי חשבון בנק מול העובד ישירות; ולהתאים מדי חודש, לפני שידור מס\"ב, את רשימת המוטבים והסכומים לתלושי אותו חודש.",
    kinds: ["pay_no_payslip", "pay_shared_account", "pay_wrong_account", "ps_shared_bank", "ps_paid_after_end", "ps_duplicate_slip", "ps_too_many_slips", "left_before_year", "wages_without_months", "duplicate_id"],
  },
  payments: {
    title: "התאמת תשלומי השכר לתלושים",
    risk: "פער בין הנטו בתלוש לבין הסכום שהועבר לעובד מעיד על תשלום ידני מחוץ לתוכנת השכר או על טעות, ופוגע באמינות רישום השכר.",
    recommendation: "מומלץ שכל תשלום לעובד יבוצע דרך תוכנת השכר בלבד, ושתיערך התאמה חודשית מתועדת בין קובץ מס\"ב לבין דוח הנטו לתשלום.",
    kinds: ["pay_amount_mismatch", "pay_not_paid", "pay_month_total"],
  },
  reporting: {
    title: "שלמות ודיוק הדיווחים לרשויות (102 ו־126)",
    risk: "דיווח שגוי או חלקי לרשות המסים ולביטוח לאומי עלול לגרור שומות, קנסות וריביות, ולפגוע בזכויות העובדים.",
    recommendation:
      "מומלץ להתאים מדי חודש את דוח 102 לסיכום התלושים לפני הדיווח, ובסוף השנה להתאים את קובץ 126 לסיכום השנתי לכל עובד; לתקן פרטי עובדים חסרים או שגויים (מספרי זהות, תאריכי העסקה) בתוכנת השכר.",
    kinds: ["invalid_id", "ps_invalid_id", "months_out_of_range", "dates_inconsistent", "months_vs_employees", "month_count", "ps_vs_102_month", "ps_vs_126_employee", "ps_only_in_slips", "ps_only_in_126", "ni_wages_exceed_gross", "tax_exceeds_wages", "no_deductions"],
  },
  labor: {
    title: "עמידה בדיני העבודה וצו הפנסיה",
    risk: "תשלום מתחת לשכר המינימום, תגמול חסר על שעות נוספות או הפרשה חסרה לפנסיה ולפיצויים — חשיפה לתביעות עובדים, לקנסות ולהתחייבויות שאינן רשומות.",
    recommendation:
      "מומלץ לבחון עם יועץ שכר את המקרים שזוהו, להשלים הפרשות ותשלומים חסרים, ולהגדיר בתוכנת השכר בקרות על שכר מינימום, תעריפי שעות נוספות ושיעורי הפרשה לפנסיה.",
    kinds: ["ps_below_minimum", "ps_overtime_hours", "ps_overtime_rate", "ps_overtime_share", "ps_pension_rate", "ps_no_pension", "pension_missing", "prov_no_severance_deposits", "prov_partial_severance"],
  },
  calc: {
    title: "דיוק חישובי השכר",
    risk: "טעויות בחישוב הנטו, בניכויים או סכומים שליליים בתלוש מעידים על עדכונים ידניים בתוכנת השכר ועלולים להוביל לתשלום שגוי.",
    recommendation: "מומלץ לבדוק את מקורות הפערים, לצמצם עדכונים ידניים בתלושים ולתעד ולאשר כל תיקון ידני.",
    kinds: ["ps_net_mismatch", "ps_negative", "ps_ni_employee", "ps_wage_jump", "ps_round_net", "high_wage_outlier", "single_month", "month_spike", "employee_count_jump"],
  },
  provisions: {
    title: "הפרשות לזכויות עובדים בסוף השנה",
    risk: "הפרשות לחופשה, להבראה ולפיצויים שאינן מבוססות על נתוני השכר עלולות להציג את ההתחייבויות לעובדים בחסר או ביתר.",
    recommendation:
      "מומלץ להפיק מתוכנת השכר בסוף כל שנה דוח יתרות חופשה, זכאות להבראה וחישוב פיצויים לכל עובד, ולהתאים אליו את ההפרשות בספרים.",
    kinds: ["prov_vs_books", "prov_negative_vacation", "prov_recuperation_unpaid", "prov_missing_start"],
  },
  books: {
    title: "רישום השכר בספרים",
    risk: "פער בין דוחות השכר לבין הרישום בהנהלת החשבונות פוגע בדיוק הוצאות השכר וההתחייבויות למוסדות בדוחות הכספיים.",
    recommendation: "מומלץ לקלוט את פקודת השכר החודשית ישירות מדוח תוכנת השכר, ולהתאים מדי חודש את יתרות המוסדות (מס הכנסה, ביטוח לאומי, קופות) לדיווחים ולתשלומים.",
    kinds: ["payroll_books_diff"],
  },
  journal: {
    title: "בקרה על פקודות יומן ידניות",
    risk: "פקודות יומן חריגות (סכומים עגולים, רישום בסוף שנה או בשבת, סכומים מעל המהותיות) הן הדרך הנפוצה לעקיפת בקרות ולהצגה מוטעית.",
    recommendation: "מומלץ שכל פקודת יומן ידנית תלווה באסמכתא ותאושר על ידי גורם שאינו רושם אותה, ושיופק דוח חודשי של פקודות ידניות לסקירת ההנהלה.",
    kinds: ["je_flagged", "tb_unbalanced"],
  },
  analytics: {
    title: "הסבר לשינויים מהותיים ביתרות",
    risk: "שינויים מהותיים ביתרות לעומת השנה הקודמת שאין להם הסבר מתועד מקשים על סגירת השנה ועשויים להעיד על טעות ברישום.",
    recommendation: "מומלץ לצרף לדוחות הכספיים ניתוח שינויים מתועד לכל סעיף מהותי, כחלק מתהליך סגירת השנה.",
    kinds: ["analytics_unexplained"],
  },
};

const OTHER: TopicDef = {
  title: "ממצאים נוספים",
  risk: "",
  recommendation: "מומלץ לבחון את הממצאים ולתעד את הטיפול בהם.",
  kinds: [],
};

const kindTopic = new Map<string, string>();
for (const [id, t] of Object.entries(LETTER_TOPICS)) for (const k of t.kinds) kindTopic.set(k, id);

/** קיבוץ הממצאים לנושאים. ממצאים ברמת "לידיעה" לא נכללים במכתב. */
export function buildManagementLetter(items: LetterItem[], opts: { maxExamples?: number } = {}): LetterTopic[] {
  const max = opts.maxExamples ?? 3;
  const groups = new Map<string, LetterItem[]>();
  for (const it of items) {
    if (it.severity === "info") continue;
    const topic = kindTopic.get(it.kind) ?? "other";
    groups.set(topic, [...(groups.get(topic) ?? []), it]);
  }
  const order = [...Object.keys(LETTER_TOPICS), "other"];
  const out: LetterTopic[] = [];
  for (const id of order) {
    const list = groups.get(id);
    if (!list?.length) continue;
    const def = id === "other" ? OTHER : LETTER_TOPICS[id];
    const kinds = new Map<string, { kind: string; label: string; count: number }>();
    for (const it of list) {
      const k = kinds.get(it.kind) ?? { kind: it.kind, label: it.label, count: 0 };
      k.count++;
      kinds.set(it.kind, k);
    }
    // דוגמאות: קודם שגיאות, ומכל סוג לפחות אחת
    const sorted = [...list].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
    const examples: string[] = [];
    for (const k of new Set(sorted.map((x) => x.kind))) {
      const first = sorted.find((x) => x.kind === k);
      if (first && examples.length < max) examples.push(first.message);
    }
    for (const it of sorted) {
      if (examples.length >= max) break;
      if (!examples.includes(it.message)) examples.push(it.message);
    }
    out.push({
      id,
      title: def.title,
      risk: def.risk,
      recommendation: def.recommendation,
      kinds: [...kinds.values()].sort((a, b) => b.count - a.count),
      examples,
      total: list.length,
      severe: list.some((x) => x.severity === "error"),
    });
  }
  // נושאים חמורים קודם, בלי לשבור את הסדר הענייני בתוך כל רמה
  return [...out.filter((t) => t.severe), ...out.filter((t) => !t.severe)];
}
