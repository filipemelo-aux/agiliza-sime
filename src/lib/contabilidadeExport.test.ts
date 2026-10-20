import { describe, it, expect } from "vitest";
import { accountingPayableEntries, competenciaRange, payableStatus, payableBalance, normalizeCst, groupCtesByAgenciaCst, includesAccountingAccount, isExpenseAccount, accountingAgency, accountingCteServiceType, splitAccountingContracts } from "./contabilidadeExport";

describe("contabilidadeExport", () => {
  const expense = { id: "e", valor_total: 300, valor_pago: 0, data_vencimento: "2026-09-10" };
  const installments = ["2026-09-10", "2026-10-10", "2026-10-25", "2026-11-10"].map((date, i) => ({ id: `p${i}`, expense_id: "e", numero_parcela: i + 1, total_parcelas: 4, valor: 100, data_vencimento: date, status: "pendente" }));
  it("atrasadas incluem somente vencimentos da competência já vencidos, sem meses anteriores ou futuros", () => {
    const rows = accountingPayableEntries(expense, installments, [], "2026-10", "2026-10-20");
    expect(rows.atrasadas.map((r) => r.venc)).toEqual(["2026-10-10"]);
    expect(rows.atrasadas[0].total).toBe(100);
  });
  it("pagas usam cada pagamento da competência, não a última data do pai nem o acumulado", () => {
    const payments = [
      { expense_id: "e", installment_id: "p0", data_pagamento: "2026-09-28", valor: 100, forma_pagamento: "PIX" },
      { expense_id: "e", installment_id: "p1", data_pagamento: "2026-10-01", valor: 30, forma_pagamento: "PIX" },
      { expense_id: "e", installment_id: "p1", data_pagamento: "2026-10-31", valor: 20, forma_pagamento: "PIX" },
      { expense_id: "e", installment_id: "p2", data_pagamento: "2026-11-01", valor: 10, forma_pagamento: "PIX" },
    ];
    const rows = accountingPayableEntries({ ...expense, data_pagamento: "2026-11-01", valor_pago: 160 }, installments, payments, "2026-10", "2026-10-20");
    expect(rows.pagas.map((r) => r.data)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(rows.pagas.reduce((sum, r) => sum + r.pago, 0)).toBe(50);
    expect(rows.atrasadas[0].pago).toBe(50);
  });
  it("preserva o vínculo da parcela, juros e desconto sem inflar o saldo", () => {
    const rows = accountingPayableEntries(expense, installments, [{ expense_id: "e", installment_id: "p1", data_pagamento: "2026-10-15", valor: 55, juros: 5, desconto: 10, forma_pagamento: "PIX" }], "2026-10", "2026-10-20");
    expect(rows.atrasadas[0].pago).toBe(60);
    expect(rows.pagas[0]).toMatchObject({ parcela: "2/4", pago: 55, juros: 5, desconto: 10 });
  });
  it("pagamento legado sem histórico só entra no mês pago e não se replica nas parcelas", () => {
    const e = { ...expense, data_pagamento: "2026-10-02", valor_pago: 100 };
    expect(accountingPayableEntries(e, installments, [], "2026-10", "2026-10-20").pagas).toHaveLength(1);
    expect(accountingPayableEntries(e, installments, [], "2026-09", "2026-10-20").pagas).toEqual([]);
  });
  it("separa contratos de frete PJ e PF pelo tipo registrado no contrato", () => {
    const pj = { numero: 9, contratado_tipo: "PJ" };
    const pf = { numero: 10, contratado_tipo: "PF" };
    expect(splitAccountingContracts([pj, pf])).toEqual({ PJ: [pj], PF: [pf] });
  });
  it("inclui apenas os planos selecionados e permite excluir um plano", () => {
    expect(includesAccountingAccount("2.1.3.01", ["2.1.3.02"])).toBe(false);
    expect(includesAccountingAccount("2.1.3.02", ["2.1.3.02"])).toBe(true);
    expect(includesAccountingAccount("2.1.3.01", null)).toBe(true);
    expect(includesAccountingAccount("2.1.3.01", [])).toBe(false);
    expect(includesAccountingAccount(null, ["sem_classificacao"])).toBe(true);
  });
  it("identifica a agência apenas por Matriz ou Filial e UF", () => {
    expect(accountingAgency({ type: "matriz", endereco_uf: "TO" })).toBe("Matriz - TO");
    expect(accountingAgency({ type: "filial", endereco_uf: "PA" })).toBe("Filial - PA");
  });
  it("distingue CT-e Normal de Subcontratação", () => {
    expect(accountingCteServiceType(0)).toBe("Normal");
    expect(accountingCteServiceType("1")).toBe("Subcontratação");
    expect(accountingCteServiceType(2)).toBe("Redespacho");
    expect(accountingCteServiceType(null)).toBe("Não informado");
  });
  it("competência cobre o mês inteiro", () => {
    expect(competenciaRange("2026-02")).toMatchObject({ ini: "2026-02-01", fim: "2026-02-28" });
  });
  it("vencida com saldo é Atrasado; quitada é Pago", () => {
    expect(payableStatus(100, 40, "2026-09-10", "2026-10-01")).toBe("Atrasado");
    expect(payableStatus(100, 100, "2026-09-10", "2026-10-01")).toBe("Pago");
    expect(payableStatus(100, 40, "2026-10-10", "2026-10-01")).toBe("Parcial");
  });
  it("saldo arredondado em centavos", () => {
    expect(payableBalance(1855.9, 1855.47)).toBe(0.43);
  });
  it("agrupa CT-es por agência e CST normalizado", () => {
    const r = groupCtesByAgenciaCst([
      { agencia: "A", cst_icms: "020", valor_frete: 100, base_calculo_icms: 80, valor_icms: 9.6 },
      { agencia: "A", cst_icms: "20", valor_frete: 50, base_calculo_icms: 40, valor_icms: 4.8 },
      { agencia: "A", cst_icms: "40", valor_frete: 10, base_calculo_icms: 0, valor_icms: 0 },
    ]);
    expect(normalizeCst("")).toBe("Sem CST");
    expect(r).toEqual([
      { agencia: "A", cst: "20", quantidade: 2, frete: 150, base: 120, icms: 14.4 },
      { agencia: "A", cst: "40", quantidade: 1, frete: 10, base: 0, icms: 0 },
    ]);
  });
  it("oferece apenas contas de despesa na seleção do pacote", () => {
    expect(isExpenseAccount("despesa")).toBe(true);
    expect(isExpenseAccount(" DESPESA ")).toBe(true);
    expect(isExpenseAccount("receita")).toBe(false);
    expect(isExpenseAccount(null)).toBe(false);
    expect(isExpenseAccount(undefined)).toBe(false);
  });
});
