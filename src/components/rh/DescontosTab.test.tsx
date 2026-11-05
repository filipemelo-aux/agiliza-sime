import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularDescontosLegais } from "@/services/rh/tributosFolhaService";
import { DescontosTab } from "./DescontosTab";

const mocks = vi.hoisted(() => ({ batch: vi.fn(), manual: vi.fn(), periodo: vi.fn(), month: vi.fn(), changed: vi.fn() }));
vi.mock("@/services/rh", () => ({
  createDescontoFolha: mocks.manual,
  createDescontosFolhaBatch: mocks.batch,
  deleteDescontoFolha: vi.fn(),
  fetchDescontosPendentesNoPeriodo: mocks.periodo,
  fetchDescontosPendentesForMonth: mocks.month,
  calcularDescontosLegais,
}));
vi.mock("@/hooks/useConfirmDialog", () => ({ useConfirmDialog: () => ({ confirm: async () => true, ConfirmDialog: null }) }));
vi.mock("@/lib/notice", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const motorista = { id: "motorista-1", full_name: "Motorista", ativo: true, salario: 3071.24, regime: "clt" as const, tipo: "motorista" as const, email: null, phone: null, cargo: null, departamento: null, data_admissao: null };
const periodo = { month: "2026-10", inicio: "2026-10-16", fim: "2026-10-31" };

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.periodo.mockResolvedValue([]); mocks.month.mockResolvedValue([]); mocks.batch.mockResolvedValue([]); });

describe("Descontos de folha do motorista", () => {
  it("gera somente descontos calculados e os disponibiliza na quinzena escolhida", async () => {
    render(<DescontosTab colaboradores={[motorista]} periodo={periodo} apenasFolha onChanged={mocks.changed} />);
    await waitFor(() => expect(mocks.periodo).toHaveBeenCalledWith(["motorista-1"], "2026-10-16", "2026-10-31"));
    fireEvent.click(screen.getByRole("button", { name: /Calcular para/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Lançar \(/ }));
    await waitFor(() => expect(mocks.batch).toHaveBeenCalledWith([
      expect.objectContaining({ colaborador_id: "motorista-1", tipo: "inss", valor: 257.15, data_referencia: "2026-10-16" }),
      expect.objectContaining({ colaborador_id: "motorista-1", tipo: "irrf", valor: 2.64, data_referencia: "2026-10-16" }),
    ]));
    expect(mocks.manual).not.toHaveBeenCalled();
    expect(mocks.month).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.changed).toHaveBeenCalledOnce());
  });

  it("não gera novamente o INSS já existente na quinzena", async () => {
    mocks.periodo.mockResolvedValue([{ id: "inss-existente", colaborador_id: "motorista-1", tipo: "inss", valor: 257.15 }]);
    render(<DescontosTab colaboradores={[motorista]} periodo={periodo} apenasFolha />);
    await waitFor(() => expect(mocks.periodo).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Calcular para/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Lançar \(/ }));
    await waitFor(() => expect(mocks.batch).toHaveBeenCalledWith([
      expect.objectContaining({ tipo: "irrf", valor: 2.64, data_referencia: "2026-10-16" }),
    ]));
  });
});