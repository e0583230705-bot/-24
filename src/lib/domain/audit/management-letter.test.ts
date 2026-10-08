import { describe, expect, it } from "vitest";
import { buildManagementLetter, LETTER_TOPICS, type LetterItem } from "./management-letter";
import { FINDING_LABELS } from "../payroll/checks";
import { PAYSLIP_FINDING_LABELS } from "../payroll/payslip-checks";
import { PROVISION_FINDING_LABELS } from "../payroll/provisions";
import { PAYMENT_FINDING_LABELS } from "../payroll/payments";

const item = (kind: string, severity: LetterItem["severity"], n = 1): LetterItem => ({ kind, label: kind, severity, message: `${kind} #${n}`, key: `${kind}:${n}` });

describe("buildManagementLetter", () => {
  it("groups findings into topics, severe topics first, and skips info-only items", () => {
    const topics = buildManagementLetter([
      item("ps_below_minimum", "warning"),
      item("ps_below_minimum", "warning", 2),
      item("pay_no_payslip", "error"),
      item("prov_partial_severance", "info"),
      item("je_flagged", "warning"),
    ]);
    expect(topics.map((t) => t.id)).toEqual(["ghost", "labor", "journal"]);
    expect(topics[0]).toMatchObject({ severe: true, total: 1 });
    expect(topics[1].kinds).toEqual([{ kind: "ps_below_minimum", label: "ps_below_minimum", count: 2 }]);
    expect(topics[1].recommendation).toBe(LETTER_TOPICS.labor.recommendation);
  });

  it("keeps examples short and covers each kind before repeating", () => {
    const topics = buildManagementLetter([
      ...[1, 2, 3, 4].map((n) => item("ps_shared_bank", "warning", n)),
      item("pay_wrong_account", "error"),
    ]);
    expect(topics[0].examples).toHaveLength(3);
    expect(topics[0].examples[0]).toBe("pay_wrong_account #1");
    expect(topics[0].examples).toContain("ps_shared_bank #1");
  });

  it("puts unknown kinds under 'other' and returns nothing when there are no findings", () => {
    expect(buildManagementLetter([item("something_new", "warning")]).map((t) => t.id)).toEqual(["other"]);
    expect(buildManagementLetter([])).toEqual([]);
  });

  it("maps every payroll finding kind to exactly one topic", () => {
    const all = Object.values(LETTER_TOPICS).flatMap((t) => t.kinds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("topic coverage", () => {
  it("every finding kind the checks can produce belongs to a letter topic", () => {
    const mapped = new Set(Object.values(LETTER_TOPICS).flatMap((t) => t.kinds));
    const all = [
      ...Object.keys(FINDING_LABELS),
      ...Object.keys(PAYSLIP_FINDING_LABELS),
      ...Object.keys(PROVISION_FINDING_LABELS),
      ...Object.keys(PAYMENT_FINDING_LABELS),
      "tb_unbalanced",
      "je_flagged",
      "analytics_unexplained",
      "payroll_books_diff",
    ];
    expect(all.filter((k) => !mapped.has(k))).toEqual([]);
  });
});
