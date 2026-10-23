import { describe, expect, it } from "vitest";
import { installmentPrincipalMap, matchesPayableReportFilter, payableReportState, paymentPrincipal } from "./payableReportState";

describe("separação das contas no relatório bancário", () => {
  it("preserva estorno negativo no cálculo do principal", () => {
    expect(paymentPrincipal(-1459.9, 0)).toBe(-1459.9);
    expect(installmentPrincipalMap([{ id: "p", expense_id: "e", numero_parcela: 1, valor: 1459.9, status: "pendente" }], [
      { expense_id: "e", valor: 1459.9 }, { expense_id: "e", valor: -1459.9 },
    ]).p).toBe(0);
  });
  it("desconto liquida principal sem contar como saída de caixa", () => {
    expect(paymentPrincipal(80, 0, 20)).toBe(100);
  });
  it("distribui pagamento sem vínculo nas parcelas em ordem e sem duplicar", () => {
    const parts = [1, 2, 3, 4].map(n => ({ id: String(n), expense_id: "iccap", numero_parcela: n, valor: 975, status: "pendente" }));
    const paid = installmentPrincipalMap(parts, [{ expense_id: "iccap", valor: 975 }, { expense_id: "iccap", installment_id: "1", valor: 975 }, { expense_id: "iccap", installment_id: "2", valor: 975 }]);
    expect(paid).toEqual({ "1": 975, "2": 975, "3": 975, "4": 0 });
  });
  it("juros não amortizam a parcela parcial", () => {
    const paid = installmentPrincipalMap([{ id: "p", expense_id: "e", numero_parcela: 1, valor: 1750, status: "pendente" }], [{ expense_id: "e", installment_id: "p", valor: 470.1, juros: 33.1 }]);
    expect(payableReportState(1750, paid.p, "parcial", "2026-10-01", "2026-10-22").balance).toBe(1313);
  });
  it("não inclui pagamento parcial vencido em Em aberto", () => {
    const state = payableReportState(3600, 2978.13, "parcial", "2026-10-19", "2026-10-20");
    const row = { status: state.status, vencido: state.overdue };
    expect(state.balance).toBe(621.87);
    expect(matchesPayableReportFilter(row, "atrasado")).toBe(true);
    expect(matchesPayableReportFilter(row, "aberto")).toBe(false);
  });
  it("vencimento de hoje permanece a vencer mesmo com status antigo atrasado", () => {
    const state = payableReportState(100, 0, "atrasado", "2026-10-20", "2026-10-20");
    expect(state.status).toBe("pendente");
    expect(matchesPayableReportFilter({ status: state.status, vencido: state.overdue }, "aberto")).toBe(true);
  });
  it("conta paga não pertence às duas categorias de dívida", () => {
    const state = payableReportState(100, 100, "pago", "2026-10-01", "2026-10-20");
    expect(state.balance).toBe(0);
    for (const filter of ["aberto", "atrasado"] as const) {
      expect(matchesPayableReportFilter({ status: state.status, vencido: state.overdue }, filter)).toBe(false);
    }
  });
  it("juros não reduzem o principal das parcelas", () => {
    expect(paymentPrincipal(110, 10)).toBe(100);
    expect(payableReportState(200, paymentPrincipal(110, 10), "pendente", "2026-10-30", "2026-10-20").balance).toBe(100);
  });
});