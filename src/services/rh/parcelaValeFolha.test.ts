import { describe, it, expect } from "vitest";
import { computePayrollRowsFromPeriodo } from "./rhViewModel";

describe("parcela de vale na folha", () => {
  it("soma parcela de vale em Adiantamentos, não em Descontos", () => {
    const rows: any[] = computePayrollRowsFromPeriodo({
      colaboradores: [{ id: "c1", ativo: true, salario: 0, tipo: "motorista", is_colaborador_rh: true } as any],
      periodo: { tipo: "quinzena", inicio: "2026-11-01", fim: "2026-11-15" } as any,
      adiantamentos: [], comissoes: [],
      descontos: [
        { id: "d1", colaborador_id: "c1", tipo: "adiantamento", valor: 333.33 } as any,
        { id: "d2", colaborador_id: "c1", tipo: "inss", valor: 50 } as any,
      ],
    } as any);
    expect(rows[0]?.adiantamentos).toBeCloseTo(333.33);
    expect(rows[0]?.descontos).toBeCloseTo(50);
  });
});
