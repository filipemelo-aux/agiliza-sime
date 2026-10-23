import { describe, expect, it } from "vitest";
import { cardCompetenceValue, effectiveCompetence, inCompetence } from "./dreCompetence";

describe("competência do DRE", () => {
  it("usa emissão apenas quando competência está ausente", () => {
    expect(effectiveCompetence({ data_competencia: "2026-09-01", data_emissao: "2026-10-02" })).toBe("2026-09-01");
    expect(inCompetence(effectiveCompetence({ data_emissao: "2026-10-02" }), "2026-10-01", "2026-10-31")).toBe(true);
  });
  it("não conta baixa no cartão novamente quando a despesa original existe", () => {
    expect(cardCompetenceValue({ amount: 300, origem_expense_id: "original" }, new Set(["original"]))).toBe(0);
  });
  it("conta compra parcelada uma única vez pelo total original", () => {
    expect(cardCompetenceValue({ amount: 100, parcela_atual: 1, parcela_total: 3 }, new Set())).toBe(300);
    expect(cardCompetenceValue({ amount: 100, parcela_atual: 2, parcela_total: 3 }, new Set())).toBe(0);
  });
  it("preserva sinal do estorno do cartão e ignora itens descartados", () => {
    expect(cardCompetenceValue({ amount: -50 }, new Set())).toBe(-50);
    expect(cardCompetenceValue({ amount: 50, ignored: true }, new Set())).toBe(0);
  });
  it("não transfere compra de setembro para outubro", () => {
    expect(inCompetence("2026-09-30", "2026-10-01", "2026-10-31")).toBe(false);
  });
});