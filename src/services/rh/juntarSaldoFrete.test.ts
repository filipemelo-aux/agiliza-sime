import { describe, it, expect } from "vitest";
import { juntarSaldosFrete } from "./juntarSaldoFrete";
const mov = (id: string, v: number) => ({ id: `c-${id}`, origemId: id, natureza: "comissao" as const, data: "2026-11-02", descricao: "x", entrada: v, saida: 0, removivel: false, origemTipo: "comissao" as const });
describe("juntarSaldosFrete", () => {
  it("junta principal e saldo da mesma quinzena com o frete total", () => {
    const r = juntarSaldosFrete([mov("a", 100), mov("b", 50)],
      [{ id: "a", referenciaId: "cteA", origem: "cte", valorBase: 1000, percentual: 10 }, { id: "b", referenciaId: "cteB", origem: "cte", valorBase: 500, percentual: 10 }],
      [{ id: "cteA", origemId: null }, { id: "cteB", origemId: "cteA" }]);
    expect(r).toHaveLength(1);
    expect(r[0].entrada).toBe(150);
    expect(r[0].descricao).toContain("1.500,00");
  });
  it("não junta saldo cujo principal está em outra quinzena", () => {
    const r = juntarSaldosFrete([mov("b", 50)], [{ id: "b", referenciaId: "cteB", origem: "cte", valorBase: 500, percentual: 10 }], [{ id: "cteB", origemId: "cteA" }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("c-b");
  });
});
