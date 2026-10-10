import { describe, expect, it } from "vitest";
import { findingsCsv } from "./export";
import type { EngagementFinding } from "./findings";

const labels = { tb: "מאזן בוחן", je: "פקודות חריגות", analytics: "סקירה אנליטית", recon: "התאמות", benford: "חוק בנפורד", sample: "מדגם", payroll: "שכר" };
const f = (over: Partial<EngagementFinding>): EngagementFinding => ({ area: "payroll", kind: "x", label: "סוג", severity: "warning", message: "ממצא", key: "k", ...over });

describe("findingsCsv", () => {
  it("writes an Excel-friendly CSV with the explanation documented in the file", () => {
    const csv = findingsCsv(
      [f({ key: "a", message: "העברה לעובד, שעזב" }), f({ area: "je", key: "b", severity: "error", message: "=SUM(A1)" })],
      new Map([["a", { text: "אושר מול ההנהלה", author: "רינה", updatedAt: new Date("2026-10-09T10:00:00Z") }]]),
      labels,
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("תחום,חומרה,סוג הממצא,ממצא,הסבר בתיק,הוסבר על ידי,תאריך ההסבר");
    // מיון לפי תחום: je לפני payroll
    expect(lines[1]).toBe("פקודות חריגות,שגיאה,סוג,'=SUM(A1),,,");
    expect(lines[2]).toBe('שכר,לבדיקה,סוג,"העברה לעובד, שעזב",אושר מול ההנהלה,רינה,9.10.2026');
  });
});
