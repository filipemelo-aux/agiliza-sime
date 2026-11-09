import { describe, it, expect } from "vitest";
import { isRejectedPortalExpense } from "./expenseRules";

describe("isRejectedPortalExpense", () => {
  it("bloqueia edição do reembolso recusado no portal", () => {
    expect(isRejectedPortalExpense({ portal_status: "rejeitado" })).toBe(true);
  });

  it("libera as demais situações", () => {
    expect(isRejectedPortalExpense({ portal_status: "em_analise" })).toBe(false);
    expect(isRejectedPortalExpense({ portal_status: "aprovado" })).toBe(false);
    expect(isRejectedPortalExpense({ portal_status: null })).toBe(false);
    expect(isRejectedPortalExpense({})).toBe(false);
    expect(isRejectedPortalExpense(null)).toBe(false);
  });
});
