import { describe, it, expect } from "vitest";
import { canApprovePortalExpense, isRejectedPortalExpense } from "./expenseRules";

describe("aprovação do reembolso", () => {
  const reviewed = { portal_status: "em_analise", portal_revisado_em: "2026-11-09T18:10:00Z", plano_contas_id: "conta", favorecido_id: "pessoa", favorecido_nome: "Fornecedor", descricao: "Conserto do pneu" };
  it("exige salvar a edição antes de aprovar", () => {
    expect(canApprovePortalExpense({ ...reviewed, portal_revisado_em: null })).toBe(false);
    expect(canApprovePortalExpense(reviewed)).toBe(true);
  });
  it("exige plano de contas", () => {
    expect(canApprovePortalExpense({ ...reviewed, plano_contas_id: null })).toBe(false);
  });
  it("exige detalhes na descrição", () => {
    expect(canApprovePortalExpense({ ...reviewed, descricao: "  " })).toBe(false);
  });
  it("exige favorecido cadastrado e identificado", () => {
    expect(canApprovePortalExpense({ ...reviewed, favorecido_id: null })).toBe(false);
    expect(canApprovePortalExpense({ ...reviewed, favorecido_nome: "  " })).toBe(false);
  });
});

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
