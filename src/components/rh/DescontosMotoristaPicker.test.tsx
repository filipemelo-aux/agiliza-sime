import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularDescontosLegais } from "@/services/rh/tributosFolhaService";
import { DescontosMotoristaPicker } from "./DescontosMotoristaPicker";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), create: vi.fn(), add: vi.fn(), plans: vi.fn() }));
vi.mock("@/services/rh", () => ({ calcularDescontosLegais, fetchDescontosPendentesNoPeriodo: mocks.fetch, createDescontosFolhaBatch: mocks.create, criarPlanosDescontoAcerto: mocks.plans }));
vi.mock("@/hooks/useRHPeriodConfig", () => ({ useRHPeriodConfig: () => ({ config: { firstEndDay: 15, firstPayDay: 20, secondPayDay: 5 } }) }));
vi.mock("@/lib/notice", () => ({ toast: { error: vi.fn() } }));
const colaborador = { id: "motorista-1", full_name: "Motorista", ativo: true, salario: 3071.24, regime: "clt" as const, tipo: "motorista" as const, email: null, phone: null, cargo: null, departamento: null, data_admissao: null };
const periodo = { month: "2026-10", inicio: "2026-10-16", fim: "2026-10-31" };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); mocks.fetch.mockResolvedValue([]); mocks.add.mockResolvedValue(undefined);
  mocks.create.mockImplementation(async (rows) => rows.map((r: any) => ({ ...r, id: `saved-${r.tipo}` })));
  mocks.plans.mockResolvedValue([]);
});
describe("Seleção direta dos descontos", () => {
  it("prepara crédito sem gravar, salvando o plano só ao adicionar", async () => {
    mocks.plans.mockResolvedValue([{ id: "parcela-1", tipo: "credito_trabalhador", valor: 250, descricao: "Contrato teste", data_referencia: periodo.inicio, parcela_numero: 1, parcelas_total: 10 }]);
    render(<DescontosMotoristaPicker colaborador={colaborador} periodo={periodo} disponiveis={[]} onAdicionar={mocks.add} />);
    await screen.findByRole("checkbox", { name: "INSS" });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Contrato teste" } });
    fireEvent.change(screen.getByLabelText("Valor da parcela"), { target: { value: "25000" } });
    fireEvent.change(screen.getByLabelText("Parcelas"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Incluir" }));
    expect(mocks.plans).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à movimentação/ }));
    await waitFor(() => expect(mocks.plans).toHaveBeenCalledWith(colaborador.id, periodo, [expect.objectContaining({ tipo: "credito_trabalhador", valor: 250, parcelas: 10 })]));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([expect.objectContaining({ origemId: "parcela-1", saida: 250 })]));
  });
  it("reutiliza a primeira parcela quando a inclusão na movimentação falha", async () => {
    mocks.add.mockRejectedValueOnce(new Error("Falha no vínculo"));
    mocks.plans.mockImplementation(async (_id, _periodo, planos) => planos.length ? [{ id: "parcela-1", tipo: "credito_trabalhador", valor: 250, descricao: "Contrato teste", data_referencia: periodo.inicio, parcela_numero: 1, parcelas_total: 10 }] : []);
    render(<DescontosMotoristaPicker colaborador={colaborador} periodo={periodo} disponiveis={[]} onAdicionar={mocks.add} />);
    await screen.findByRole("checkbox", { name: "INSS" });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Contrato teste" } });
    fireEvent.change(screen.getByLabelText("Valor da parcela"), { target: { value: "25000" } });
    fireEvent.change(screen.getByLabelText("Parcelas"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Incluir" }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à movimentação/ }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /Adicionar à movimentação/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à movimentação/ }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
    expect(mocks.plans.mock.calls[1][2]).toEqual([]);
    expect(mocks.add.mock.calls[1][0][0].origemId).toBe("parcela-1");
  });
  it("calcula sem gravar e adiciona somente o imposto selecionado", async () => {
    render(<DescontosMotoristaPicker colaborador={colaborador} periodo={periodo} disponiveis={[]} onAdicionar={mocks.add} />);
    const inss = await screen.findByRole("checkbox", { name: "INSS" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
    fireEvent.click(inss);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à movimentação/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith([expect.objectContaining({ tipo: "inss", valor: 257.15, data_referencia: "2026-10-16" })]));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([expect.objectContaining({ origemId: "saved-inss", natureza: "desconto", saida: 257.15, entrada: 0 })]));
  });
  it("reutiliza desconto existente sem criar outro INSS", async () => {
    mocks.fetch.mockResolvedValue([{ id: "old", tipo: "inss", valor: 257.15 }]);
    const mov = { id: "d-old", origemId: "old", origemTipo: "desconto" as const, natureza: "desconto" as const, descricao: "INSS existente", data: "2026-10-16", entrada: 0, saida: 257.15, removivel: true };
    render(<DescontosMotoristaPicker colaborador={colaborador} periodo={periodo} disponiveis={[mov]} onAdicionar={mocks.add} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "INSS existente" }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à movimentação/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith([]));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([mov]));
  });
});