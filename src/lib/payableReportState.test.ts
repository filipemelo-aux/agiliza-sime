import { describe, expect, it } from "vitest";
import { matchesPayableReportFilter, payableReportState, paymentPrincipal } from "./payableReportState";

describe("separação das contas no relatório bancário", () => {
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