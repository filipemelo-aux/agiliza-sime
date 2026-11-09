import { describe, expect, it } from "vitest";
import {
  buildPayableUnits,
  dashboardPayableNavigation,
  portalRowLabel,
  portalRowTone,
  type PayableExpense,
  type PayableInstallment,
} from "./dashboardPayables";
import { payableQuickFilterPeriod } from "./payableReportState";

describe("atalhos das contas da página inicial", () => {
  const today = new Date(2026, 10, 9);

  it("Vencendo Hoje abre o detalhe com a mesma lista inicial do menu Contas a Pagar", () => {
    const state = dashboardPayableNavigation("hoje", "conta-hoje");
    expect(state).toEqual({ fromNav: true, quickFilter: "a_vencer", openExpenseId: "conta-hoje" });
    expect(payableQuickFilterPeriod(state.quickFilter, today)).toEqual({ inicio: "2026-11-09", fim: "2026-11-30" });
  });

  it("Vencidos 7 dias abre o detalhe com todas as atrasadas, sem limitar aos sete dias", () => {
    const state = dashboardPayableNavigation("atrasadas", "conta-atrasada");
    expect(state).toEqual({ fromNav: true, quickFilter: "atrasadas", openExpenseId: "conta-atrasada" });
    expect(payableQuickFilterPeriod(state.quickFilter, today)).toEqual({ inicio: "", fim: "2026-11-08" });
  });
});

const expense = (over: Partial<PayableExpense>): PayableExpense => ({
  id: "e1",
  descricao: "Reembolso motorista — Pedágio",
  favorecido_nome: null,
  valor_total: 20,
  valor_pago: 0,
  data_vencimento: "2026-11-09",
  data_emissao: "2026-11-09",
  portal_status: null,
  ...over,
});

describe("buildPayableUnits", () => {
  it("inclui despesa de pagamento único pelo saldo não pago, com o status do portal", () => {
    const units = buildPayableUnits(
      [expense({ valor_total: 20, valor_pago: 5, portal_status: "em_analise" })],
      []
    );
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      id: "e1",
      expense_id: "e1",
      numero_parcela: 0,
      valor: 15,
      data_vencimento: "2026-11-09",
      portal_status: "em_analise",
    });
  });

  it("usa a data de emissão quando a despesa não tem vencimento", () => {
    const units = buildPayableUnits(
      [expense({ data_vencimento: null, data_emissao: "2026-11-02" })],
      []
    );
    expect(units[0].data_vencimento).toBe("2026-11-02");
  });

  it("conta as parcelas e não repete a despesa que as origina", () => {
    const installments: PayableInstallment[] = [
      { id: "i1", expense_id: "e1", numero_parcela: 1, valor: 10, data_vencimento: "2026-11-09", status: "pendente" },
      { id: "i2", expense_id: "e1", numero_parcela: 2, valor: 10, data_vencimento: "2026-11-16", status: "pendente" },
    ];
    const units = buildPayableUnits([expense({ valor_total: 20 })], installments);
    expect(units.map((u) => u.id)).toEqual(["i1", "i2"]);
    expect(units.every((u) => u.expense_id === "e1")).toBe(true);
  });

  it("não gera linha para despesa sem vencimento nem emissão", () => {
    const units = buildPayableUnits(
      [expense({ data_vencimento: null, data_emissao: null })],
      []
    );
    expect(units).toEqual([]);
  });
});

describe("portalRowTone / portalRowLabel", () => {
  it("usa violeta para reembolso em análise", () => {
    expect(portalRowTone("em_analise")).toBe("review");
    expect(portalRowLabel("em_analise")).toBe("Reembolso em análise (portal)");
  });

  it("usa cinza apagado para reembolso recusado", () => {
    expect(portalRowTone("rejeitado")).toBe("cancelled");
    expect(portalRowLabel("rejeitado")).toBe("Reembolso recusado");
  });

  it("não altera despesas comuns", () => {
    expect(portalRowTone(null)).toBeNull();
    expect(portalRowTone("aprovado")).toBeNull();
    expect(portalRowLabel(null)).toBeNull();
  });
});
