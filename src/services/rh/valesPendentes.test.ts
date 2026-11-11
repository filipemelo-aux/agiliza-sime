import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let rows = state.tables[table] || [];
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return q; },
      is: (key: string, value: unknown) => { rows = rows.filter(r => (r[key] ?? null) === value); return q; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[key])); return q; },
      lte: (key: string, value: string) => { rows = rows.filter(r => r[key] <= value); return q; },
      range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return q; },
      then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return q;
  },
} }));
vi.mock("./rhSettings", () => ({ rhSettings: { get: () => ({ adiantamentoAccountId: "adv" }) } }));
vi.mock("./comissoesService", () => ({ fetchComissoes: async () => [] }));
vi.mock("./descontosFolhaService", () => ({ fetchDescontosPendentesNoPeriodo: async () => [] }));
vi.mock("./rhFinancialService", async (original) => ({
  ...await original<typeof import("./rhFinancialService")>(),
  fetchReembolsosPendentesNoPeriodo: async () => [],
}));

import { loadMovimentosEDisponiveis } from "./acertoMotoristaService";

const period = { inicio: "2026-11-01", fim: "2026-11-15", month: "2026-11" };
const expense = (id: string, colab: string, date = "2026-09-10") => ({
  id, favorecido_id: colab, plano_contas_id: "adv", data_emissao: date,
  data_pagamento: date, valor_total: 300, descricao: "Vale anterior", deleted_at: null,
});

beforeEach(() => { state.tables = {}; });
describe("vales anteriores disponíveis no acerto", () => {
  it.each(["motorista", "administrativo"])("mantém vale de setembro sem uso no acerto de novembro do %s", async (colab) => {
    state.tables.expenses = [expense("antigo", colab)];
    const result = await loadMovimentosEDisponiveis(colab, period, []);
    expect(result.disponiveis.map(m => m.origemId)).toEqual(["antigo"]);
    expect(result.disponiveis[0].data).toBe("2026-09-10");
    expect(result.disponiveis[0].saida).toBe(300);
  });
  it("deixa de oferecer o vale ao ser utilizado em outro acerto", async () => {
    state.tables.expenses = [expense("usado", "motorista")];
    state.tables.acerto_movimentos = [{ colaborador_id: "motorista", periodo_inicio: "2026-10-01", origem_tipo: "expense", origem_id: "usado" }];
    expect((await loadMovimentosEDisponiveis("motorista", period, [])).disponiveis).toEqual([]);
  });
  it("não antecipa vales futuros nem traz vales de outro colaborador", async () => {
    state.tables.expenses = [expense("futuro", "motorista", "2026-11-16"), expense("outro", "administrativo")];
    expect((await loadMovimentosEDisponiveis("motorista", period, [])).disponiveis).toEqual([]);
  });
  it("preserva o vale antigo já incluído no acerto atual", async () => {
    state.tables.expenses = [expense("incluido", "motorista")];
    state.tables.acerto_movimentos = [{ colaborador_id: "motorista", periodo_inicio: period.inicio, natureza: "vale", origem_tipo: "expense", origem_id: "incluido" }];
    const result = await loadMovimentosEDisponiveis("motorista", period, []);
    expect(result.incluidas.map(m => m.origemId)).toEqual(["incluido"]);
    expect(result.disponiveis).toEqual([]);
  });
  it("não oferece o valor integral de um vale já parcelado", async () => {
    state.tables.expenses = [expense("parcelado", "motorista")];
    state.tables.descontos_folha = [{ adiantamento_origem_id: "parcelado" }];
    expect((await loadMovimentosEDisponiveis("motorista", period, [])).disponiveis).toEqual([]);
  });
});