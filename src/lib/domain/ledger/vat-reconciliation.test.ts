import { describe, expect, it } from "vitest";
import { suggestVatAccounts, vatReasonableness } from "./vat-reconciliation";
import type { LedgerLine } from "./types";

const l = (date: string, accountCode: string, amount: number): LedgerLine => ({
  entryId: date + accountCode, date, accountCode, amount, description: "", reference: null,
});

describe("suggestVatAccounts", () => {
  it("suggests revenue and output VAT accounts by name", () => {
    const s = suggestVatAccounts([
      { code: "4000", name: "הכנסות ממכירות", openingBalance: 0 },
      { code: "4100", name: "הכנסות שירותים", openingBalance: 0 },
      { code: "2200", name: 'מע"מ עסקאות', openingBalance: 0 },
      { code: "2210", name: 'מע"מ תשומות', openingBalance: 0 },
      { code: "1100", name: "בנק", openingBalance: 0 },
    ]);
    expect(s).toEqual({ revenue: ["4000", "4100"], outputVat: ["2200"] });
  });
});

describe("vatReasonableness", () => {
  const opts = { revenueAccounts: ["4000"], outputVatAccounts: ["2200"], tolerance: 1000_00, from: "2024-01-01", to: "2025-12-31" };
  it("computes expected VAT with the rate of each month and flags gaps", () => {
    const lines = [
      // דצמבר 2024: 17%
      l("2024-12-10", "4000", -100_000_00), l("2024-12-10", "2200", -17_000_00),
      // ינואר 2025: 18%
      l("2025-01-10", "4000", -100_000_00), l("2025-01-10", "2200", -18_000_00),
      // פברואר: הכנסה של 50,000 נרשמה בלי מע"מ
      l("2025-02-10", "4000", -150_000_00), l("2025-02-10", "2200", -18_000_00),
      // זיכוי בתוך החודש מקטין את שניהם
      l("2025-02-20", "4000", 10_000_00), l("2025-02-20", "2200", 1_800_00),
    ];
    const months = vatReasonableness(lines, opts);
    expect(months.map((m) => [m.month, m.rate, m.expectedVat, m.recordedVat, m.flagged])).toEqual([
      ["2024-12", 17, 17_000_00, 17_000_00, false],
      ["2025-01", 18, 18_000_00, 18_000_00, false],
      ["2025-02", 18, 25_200_00, 16_200_00, true],
    ]);
    expect(months[2].difference).toBe(-9_000_00);
  });
});
