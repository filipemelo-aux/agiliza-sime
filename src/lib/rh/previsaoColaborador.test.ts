import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { montarPrevisao, valorOriginalParcela } from "./previsaoColaborador";

describe("valorOriginalParcela", () => {
  const totais = { planos: new Map([["p1", 420]]), despesas: new Map([["e1", 400]]) };

  it("mostra o total do plano de desconto parcelado em 3 vezes", () => {
    expect(valorOriginalParcela(3, "p1", null, totais)).toBe(420);
  });

  it("mostra o valor integral do vale/adiantamento de origem", () => {
    expect(valorOriginalParcela(2, null, "e1", totais)).toBe(400);
  });

  it("não marca valor original em lançamento avulso", () => {
    expect(valorOriginalParcela(1, null, "e1", totais)).toBeUndefined();
    expect(valorOriginalParcela(null, null, null, totais)).toBeUndefined();
  });
});

describe("montarPrevisao", () => {
  it("agrupa parcelas futuras mês a mês com salário", () => {
    const m = montarPrevisao("2026-11", 3000, [
      { data: "2026-12-01", tipo: "Adiantamento", descricao: "", valor: 200 },
      { data: "2027-02-01", tipo: "Avaria", descricao: "", valor: 100 },
      { data: "2026-10-01", tipo: "Vale", descricao: "", valor: 50 },
    ]);
    expect(m.map((x) => x.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(m[1].liquido).toBe(2800);
    expect(m[3].totalDescontos).toBe(100);
  });
});
