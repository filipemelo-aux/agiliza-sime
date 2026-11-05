import { describe, expect, it } from "vitest";
import { resumirMovimentos, type MovMotorista } from "./acertoMotoristaService";
import { buildPeriodoMensal, buildPeriodoQuinzenal, computePayrollRowsFromPeriodo } from "./rhViewModel";

const mov = (partial: Partial<MovMotorista>): MovMotorista => ({
  id: "m1", origemId: "o1", origemTipo: "expense", natureza: "reembolso",
  data: "2026-10-05", descricao: "Teste", entrada: 0, saida: 0, removivel: true,
  ...partial,
});

describe("resumirMovimentos", () => {
  it("soma o salário base (linha sintética do administrativo) no saldo", () => {
    const r = resumirMovimentos([
      mov({ id: "s", natureza: "salario", entrada: 3071.24 }),
      mov({ id: "r", natureza: "reembolso", entrada: 200 }),
      mov({ id: "v", natureza: "vale", saida: 500 }),
      mov({ id: "d", natureza: "desconto", origemTipo: "desconto", saida: 100 }),
    ]);
    expect(r.salario).toBe(3071.24);
    expect(r.saldo).toBeCloseTo(2671.24, 2);
  });

  it("sem linha de salário, o saldo vem só das movimentações (motorista)", () => {
    const r = resumirMovimentos([
      mov({ id: "c", natureza: "comissao", origemTipo: "comissao", entrada: 2174.36 }),
      mov({ id: "v", natureza: "vale", saida: 590 }),
    ]);
    expect(r.salario).toBe(0);
    expect(r.saldo).toBeCloseTo(1584.36, 2);
  });
});

describe("acerto do administrativo (mês de referência completo)", () => {
  const colab = { id: "c1", full_name: "Colaborador Admin", tipo: "colaborador", ativo: true, salario: 3071.24 } as any;

  it("período mensal cobre o mês inteiro e paga no 5º dia útil do mês seguinte", () => {
    const p = buildPeriodoMensal("2026-10");
    expect(p.tipo).toBe("mensal");
    expect(p.data_inicio).toBe("2026-10-01");
    expect(p.data_fim).toBe("2026-10-31");
    expect(p.data_pagamento).toBe("2026-11-06"); // 5º dia útil de nov/2026 (2,3,4,5,6)
  });

  it("salário base entra integral (100%) no líquido do administrativo", () => {
    const [row] = computePayrollRowsFromPeriodo({
      colaboradores: [colab],
      periodo: buildPeriodoMensal("2026-10"),
      adiantamentos: [{ id: "a1", favorecido_id: "c1", valor_total: 500, valor_pago: 0 } as any],
      comissoes: [],
      descontos: [{ id: "d1", colaborador_id: "c1", valor: 100 } as any],
      reembolsos: [{ id: "r1", reembolso_colaborador_id: "c1", valor_total: 200, valor_pago: 0 } as any],
    });
    expect(row.salario_base).toBe(3071.24);
    expect(row.liquido).toBeCloseTo(3071.24 + 200 - 500 - 100, 2);
  });

  it("motorista na quinzena segue sem salário do cadastro (serviço passa salario 0)", () => {
    const motorista = { id: "m1", full_name: "Motorista", tipo: "motorista", ativo: true, salario: 0 } as any;
    const [row] = computePayrollRowsFromPeriodo({
      colaboradores: [motorista],
      periodo: buildPeriodoQuinzenal("2026-10", "primeira_quinzena"),
      adiantamentos: [],
      comissoes: [{ id: "cm1", colaborador_id: "m1", valor_calculado: 2174.36, status: "pendente" } as any],
      descontos: [],
    });
    expect(row.salario_base).toBe(0);
    expect(row.liquido).toBeCloseTo(2174.36, 2);
  });
});
