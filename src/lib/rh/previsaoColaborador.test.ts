import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { montarPrevisao } from "./previsaoColaborador";

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
