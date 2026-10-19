import { describe, expect, it } from "vitest";
import { receivableBalance, totalReceivableBalance } from "./receivableBalance";

describe("receivables grid remaining balance", () => {
  it("preserves the full original amount without receipts", () => {
    expect(receivableBalance({ valor_total: 10500 })).toBe(10500);
  });
  it("subtracts partial receipts without changing the original amount", () => {
    const invoice = { valor_total: 10500, valor_recebido_total: 8000 };
    expect(receivableBalance(invoice)).toBe(2500);
    expect(invoice.valor_total).toBe(10500);
  });
  it("shows zero for fully received invoices", () => {
    expect(receivableBalance({ valor_total: 12382.5, valor_recebido_total: 12382.5 })).toBe(0);
  });
  it("totals only the remaining balances of the supplied visible rows", () => {
    expect(totalReceivableBalance([
      { valor_total: 10500, valor_recebido_total: 8000 },
      { valor_total: 12382.5, valor_recebido_total: 12382.5 },
      { valor_total: 200 },
    ])).toBe(2700);
  });
});