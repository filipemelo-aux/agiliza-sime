import { describe, expect, it } from "vitest";
import { computeLiquido, computePayrollRowsFromPeriodo } from "./rhViewModel";
import type { ColaboradorRH } from "./rhColaboradoresService";

const employee: ColaboradorRH = { id: "driver", full_name: "Motorista", email: null, phone: null, cargo: null, departamento: null, data_admissao: null, salario: 2000, tipo: "motorista", ativo: true };
const period = { tipo: "personalizado" as const, data_inicio: "2026-10-01", data_fim: "2026-10-31", data_pagamento: "2026-11-05" };

describe("crédito de reembolso na folha", () => {
  it("soma reembolso após os descontos sem transformá-lo em salário", () => {
    expect(computeLiquido({ salary: 2000, comissoes: 0, adiant: 100, descontos: 200, reembolsos: 150 })).toBe(1850);
  });
  it("inclui somente o saldo não pago do colaborador selecionado", () => {
    const rows = computePayrollRowsFromPeriodo({ colaboradores: [employee], periodo: period, adiantamentos: [], comissoes: [], descontos: [], reembolsos: [
      { id: "receipt", descricao: "Borracharia", valor_total: 150, valor_pago: 50, data_competencia: "2026-10-10", data_emissao: "2026-10-10", reembolso_colaborador_id: "driver", reembolso_colaborador_nome: "Motorista" },
      { id: "other", descricao: "Lavajato", valor_total: 90, valor_pago: 0, data_competencia: "2026-10-10", data_emissao: "2026-10-10", reembolso_colaborador_id: "other", reembolso_colaborador_nome: "Outro" },
    ] });
    expect(rows[0]?.reembolsos).toBe(100);
    expect(rows[0]?.salario_base).toBe(2000);
    expect(rows[0]?.liquido).toBe(2100);
    expect(rows[0]?.reembolsoExpenseIds).toEqual(["receipt"]);
  });
  it("não inclui despesa já quitada ou desmarcada", () => {
    const rows = computePayrollRowsFromPeriodo({ colaboradores: [employee], periodo: period, adiantamentos: [], comissoes: [], descontos: [], selectedReembolsoIds: new Set(), reembolsos: [
      { id: "receipt", descricao: "Borracharia", valor_total: 150, valor_pago: 150, data_competencia: "2026-10-10", data_emissao: "2026-10-10", reembolso_colaborador_id: "driver", reembolso_colaborador_nome: "Motorista" },
    ] });
    expect(rows[0]?.reembolsos).toBe(0);
    expect(rows[0]?.liquido).toBe(2000);
  });
  it("não consome ressarcimento quando descontos superam salário", () => {
    expect(computeLiquido({ salary: 100, comissoes: 0, adiant: 200, descontos: 0, reembolsos: 80 })).toBe(80);
  });
});