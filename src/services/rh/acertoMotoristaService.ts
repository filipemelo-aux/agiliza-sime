/**
 * Acerto quinzenal do motorista.
 *  - Movimentações (entradas/saídas) do motorista na quinzena escolhida na grade.
 *  - "Gerar acerto" cria uma folha em aberto com o snapshot do motorista; a partir daí
 *    as movimentações ficam bloqueadas e o acerto segue o fluxo normal da Folha de Pagamento.
 *  - "Editar acerto" retira o motorista da folha (reabrindo-a se já confirmada) e libera a edição.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchComissoes } from "./comissoesService";
import { fetchDescontosPendentesNoPeriodo } from "./descontosFolhaService";
import { fetchReembolsosPendentesNoPeriodo, type ReembolsoExpense } from "./rhFinancialService";
import { buildPeriodoQuinzenal, computePayrollRowsFromPeriodo, periodoToMesReferencia } from "./rhViewModel";
import { criarFolhaEmAberto, buscarFolhaComItens, excluirItemFolhaEmAberto, reabrirFolhaConfirmada } from "./folhasPagamentoService";
import type { ColaboradorRH, Comissao, DescontoFolha, Expense } from "./index";

export type MovNatureza = "comissao" | "reembolso" | "vale" | "desconto";
export interface MovMotorista {
  id: string;
  natureza: MovNatureza;
  data: string;
  descricao: string;
  entrada: number;
  saida: number;
  /** pode ser excluída aqui (comissão/desconto ainda fora de folha) */
  removivel: boolean;
  origemId: string;
  origemTipo: "comissao" | "expense" | "desconto";
}
export interface PeriodoAcerto { inicio: string; fim: string; month: string }

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const DESC_LABEL: Record<string, string> = { inss: "INSS", irrf: "IRRF", faltas: "Faltas", multas: "Multas", combustivel: "Combustível", vale: "Vale", adiantamento: "Adiantamento", outros: "Outros" };
const inPeriod = (d: string | null | undefined, p: PeriodoAcerto) => {
  const v = (d || "").slice(0, 10);
  return !!v && v >= p.inicio && v <= p.fim;
};

interface Fontes { comissoes: Comissao[]; descontos: DescontoFolha[]; reembolsos: ReembolsoExpense[]; vales: Expense[] }

async function carregarFontes(colabId: string, p: PeriodoAcerto, adiantExpenses: Expense[]): Promise<Fontes> {
  const [comissoes, descontos, reembolsos] = await Promise.all([
    fetchComissoes({ colaboradorId: colabId, dataInicio: p.inicio, dataFim: p.fim }),
    fetchDescontosPendentesNoPeriodo([colabId], p.inicio, p.fim),
    fetchReembolsosPendentesNoPeriodo([colabId], p.inicio, p.fim),
  ]);
  const vales = adiantExpenses.filter((e: any) => e.favorecido_id === colabId && inPeriod(e.data_pagamento || e.data_emissao, p));
  return { comissoes, descontos, reembolsos, vales };
}

function toMovs(f: Fontes): MovMotorista[] {
  const list: MovMotorista[] = [
    ...f.comissoes.map((c) => ({
      id: `c-${c.id}`, origemId: c.id, natureza: "comissao" as MovNatureza, data: c.data_referencia,
      descricao: `${c.origem === "cte" ? "Viagem (CT-e)" : "Colheita"}${c.percentual != null ? ` · ${String(c.percentual).replace(".", ",")}% de ${formatBRL(Number(c.valor_base))}` : ""}${c.observacoes ? ` · ${c.observacoes}` : ""}`,
      entrada: Number(c.valor_calculado || 0), saida: 0, removivel: c.status === "pendente", origemTipo: "comissao" as const,
    })),
    ...f.reembolsos.map((e) => ({
      id: `r-${e.id}`, origemId: e.id, natureza: "reembolso" as MovNatureza, data: String(e.data_competencia || e.data_emissao).slice(0, 10),
      descricao: e.descricao, entrada: Math.max(Number(e.valor_total) - Number(e.valor_pago || 0), 0), saida: 0, removivel: false, origemTipo: "expense" as const,
    })),
    ...f.vales.map((e: any) => ({
      id: `v-${e.id}`, origemId: e.id, natureza: "vale" as MovNatureza, data: String(e.data_pagamento || e.data_emissao).slice(0, 10),
      descricao: e.descricao || "Adiantamento", entrada: 0, saida: Number(e.valor_total || 0), removivel: false, origemTipo: "expense" as const,
    })),
    ...f.descontos.map((d) => ({
      id: `d-${d.id}`, origemId: d.id, natureza: (d.tipo === "vale" || d.tipo === "adiantamento" ? "vale" : "desconto") as MovNatureza,
      data: d.data_referencia, descricao: `${DESC_LABEL[d.tipo] || d.tipo}${d.descricao ? ` · ${d.descricao}` : ""}`,
      entrada: 0, saida: Number(d.valor || 0), removivel: true, origemTipo: "desconto" as const,
    })),
  ];
  return list.sort((a, b) => a.data.localeCompare(b.data));
}

interface Vinculo { colaborador_id: string; periodo_inicio: string; origem_tipo: string; origem_id: string }
const vkey = (t: string, id: string) => `${t}:${id}`;

async function fetchVinculos(origemIds: string[]): Promise<Vinculo[]> {
  if (!origemIds.length) return [];
  const out: Vinculo[] = [];
  for (let i = 0; i < origemIds.length; i += 200) {
    const { data, error } = await (supabase.from("acerto_movimentos" as any) as any)
      .select("colaborador_id, periodo_inicio, origem_tipo, origem_id").in("origem_id", origemIds.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** Todas as candidatas da quinzena, separadas em incluídas no acerto e disponíveis para adicionar. */
export async function loadMovimentosEDisponiveis(colabId: string, p: PeriodoAcerto, adiantExpenses: Expense[]) {
  const todas = toMovs(await carregarFontes(colabId, p, adiantExpenses));
  const vinc = await fetchVinculos(todas.map((m) => m.origemId));
  const meus = new Set(vinc.filter((v) => v.colaborador_id === colabId && v.periodo_inicio === p.inicio).map((v) => vkey(v.origem_tipo, v.origem_id)));
  const usados = new Set(vinc.map((v) => vkey(v.origem_tipo, v.origem_id)));
  return {
    incluidas: todas.filter((m) => meus.has(vkey(m.origemTipo, m.origemId))),
    disponiveis: todas.filter((m) => !usados.has(vkey(m.origemTipo, m.origemId))),
  };
}

/** Movimentações adicionadas ao acerto da quinzena (começa em branco). */
export async function loadMovimentosMotorista(colabId: string, p: PeriodoAcerto, adiantExpenses: Expense[]): Promise<MovMotorista[]> {
  return (await loadMovimentosEDisponiveis(colabId, p, adiantExpenses)).incluidas;
}

/** Adiciona lançamentos ao acerto; não altera Contas a Pagar nem os lançamentos de origem. */
export async function adicionarAoAcerto(colabId: string, p: PeriodoAcerto, movs: MovMotorista[]) {
  if (!movs.length) return;
  const { error } = await (supabase.from("acerto_movimentos" as any) as any).insert(movs.map((m) => ({
    colaborador_id: colabId, periodo_inicio: p.inicio, natureza: m.natureza, origem_tipo: m.origemTipo, origem_id: m.origemId,
  })));
  if (error) throw error;
}

/** Remove do acerto apenas o vínculo; a despesa/comissão/desconto continua existindo. */
export async function removerDoAcerto(colabId: string, p: PeriodoAcerto, movs: MovMotorista[]) {
  for (const m of movs) {
    const { error } = await (supabase.from("acerto_movimentos" as any) as any).delete()
      .eq("colaborador_id", colabId).eq("periodo_inicio", p.inicio).eq("origem_tipo", m.origemTipo).eq("origem_id", m.origemId);
    if (error) throw error;
  }
}

export interface ResumoAcerto { comissoes: number; reembolsos: number; vales: number; descontos: number; saldo: number }
export function resumirMovimentos(movs: MovMotorista[]): ResumoAcerto {
  const sum = (n: MovNatureza, k: "entrada" | "saida") => movs.filter((m) => m.natureza === n).reduce((s, m) => s + m[k], 0);
  const r = { comissoes: sum("comissao", "entrada"), reembolsos: sum("reembolso", "entrada"), vales: sum("vale", "saida"), descontos: sum("desconto", "saida") };
  return { ...r, saldo: r.comissoes + r.reembolsos - r.vales - r.descontos };
}

export interface AcertoGerado { folhaId: string; itemId: string; status: string; resumo: ResumoAcerto }

/** Acertos (itens de folha não cancelada) dos colaboradores na quinzena. */
export async function fetchAcertosDoPeriodo(colabIds: string[], inicio: string): Promise<Map<string, AcertoGerado>> {
  const m = new Map<string, AcertoGerado>();
  if (!colabIds.length) return m;
  const { data, error } = await (supabase.from("folhas_pagamento_itens" as any) as any)
    .select("id, folha_id, colaborador_id, comissoes, reembolsos, adiantamentos, descontos, liquido, salario_base, folhas_pagamento!inner(status, data_inicio)")
    .in("colaborador_id", colabIds)
    .eq("folhas_pagamento.data_inicio", inicio)
    .neq("folhas_pagamento.status", "cancelada");
  if (error) throw error;
  (data || []).forEach((i: any) => m.set(i.colaborador_id, {
    folhaId: i.folha_id, itemId: i.id, status: i.folhas_pagamento?.status,
    resumo: {
      comissoes: Number(i.comissoes || 0), reembolsos: Number(i.reembolsos || 0), vales: Number(i.adiantamentos || 0),
      descontos: Number(i.descontos || 0), saldo: Number(i.liquido || 0),
    },
  }));
  return m;
}

export async function gerarAcertoMotorista(input: {
  colaborador: ColaboradorRH; periodo: PeriodoAcerto; adiantExpenses: Expense[]; empresaId: string; userId: string;
}): Promise<void> {
  const { colaborador, periodo, adiantExpenses } = input;
  const existentes = await fetchAcertosDoPeriodo([colaborador.id], periodo.inicio);
  if (existentes.has(colaborador.id)) throw new Error("O acerto desta quinzena já foi gerado.");
  const f0 = await carregarFontes(colaborador.id, periodo, adiantExpenses);
  const { incluidas } = await loadMovimentosEDisponiveis(colaborador.id, periodo, adiantExpenses);
  const inc = new Set(incluidas.map((m) => vkey(m.origemTipo, m.origemId)));
  const f: Fontes = {
    comissoes: f0.comissoes.filter((c) => inc.has(vkey("comissao", c.id))),
    reembolsos: f0.reembolsos.filter((e) => inc.has(vkey("expense", e.id))),
    vales: f0.vales.filter((e: any) => inc.has(vkey("expense", e.id))),
    descontos: f0.descontos.filter((d) => inc.has(vkey("desconto", d.id))),
  };
  const comissoes = f.comissoes.filter((c) => c.status === "pendente");
  const pf = buildPeriodoQuinzenal(periodo.month, periodo.inicio.endsWith("-01") ? "primeira_quinzena" : "segunda_quinzena");
  const [row] = computePayrollRowsFromPeriodo({
    colaboradores: [{ ...colaborador, ativo: true }], periodo: pf,
    adiantamentos: f.vales, comissoes, descontos: f.descontos, reembolsos: f.reembolsos,
  });
  if (!row) throw new Error("Nenhuma movimentação para gerar o acerto nesta quinzena.");
  await criarFolhaEmAberto({
    empresa_id: input.empresaId, created_by: input.userId,
    mes_referencia: periodoToMesReferencia(pf), data_inicio: pf.data_inicio, data_fim: pf.data_fim,
    tipo_periodo: pf.tipo, data_emissao: pf.data_fim, data_vencimento: pf.data_pagamento,
    observacoes: `Acerto de motorista — ${colaborador.full_name}`,
    itens: [{
      colaborador_id: colaborador.id, colaborador_nome: colaborador.full_name,
      salario_base: row.salario_base, adiantamentos: row.adiantamentos, descontos: row.descontos,
      comissoes: row.comissoes, liquido: row.liquido,
      reembolsos: row.reembolsos, reembolso_expense_ids: row.reembolsoExpenseIds,
      comissao_ids: row.comissaoIds, desconto_ids: row.descontoIds, adiantamento_expense_ids: row.adiantamentoExpenseIds,
    }],
  });
}

/** Retira o motorista da folha e devolve as movimentações para edição. */
export async function editarAcertoMotorista(acerto: AcertoGerado): Promise<void> {
  const { folha } = await buscarFolhaComItens(acerto.folhaId);
  if (folha.status === "confirmada") await reabrirFolhaConfirmada(acerto.folhaId);
  await excluirItemFolhaEmAberto(acerto.folhaId, acerto.itemId);
}

/** Movimentações gravadas no acerto (independe do status atual das origens — usado após gerar o acerto). */
export async function loadMovimentosDoAcerto(colabId: string, inicio: string): Promise<MovMotorista[]> {
  const { data: vinc, error } = await (supabase.from("acerto_movimentos" as any) as any)
    .select("natureza, origem_tipo, origem_id").eq("colaborador_id", colabId).eq("periodo_inicio", inicio);
  if (error) throw error;
  const v = (vinc || []) as { natureza: MovNatureza; origem_tipo: string; origem_id: string }[];
  const ids = (t: string) => v.filter((x) => x.origem_tipo === t).map((x) => x.origem_id);
  const natPorId = new Map(v.map((x) => [x.origem_id, x.natureza]));
  const q = async (table: string, cols: string, list: string[]) => {
    if (!list.length) return [] as any[];
    const { data, error: e } = await (supabase.from(table as any) as any).select(cols).in("id", list);
    if (e) throw e;
    return (data || []) as any[];
  };
  const [coms, exps, descs] = await Promise.all([
    q("comissoes", "*", ids("comissao")),
    q("expenses", "id, descricao, valor_total, data_emissao, data_pagamento, data_competencia", ids("expense")),
    q("descontos_folha", "*", ids("desconto")),
  ]);
  const list: MovMotorista[] = [
    ...toMovs({ comissoes: coms, descontos: descs, reembolsos: [], vales: [] }),
    ...exps.map((e) => {
      const nat = natPorId.get(e.id) === "reembolso" ? "reembolso" : "vale";
      const valor = Number(e.valor_total || 0);
      return {
        id: `${nat === "reembolso" ? "r" : "v"}-${e.id}`, origemId: e.id, natureza: nat as MovNatureza,
        data: String((nat === "reembolso" ? e.data_competencia || e.data_emissao : e.data_pagamento || e.data_emissao) || "").slice(0, 10),
        descricao: e.descricao || (nat === "reembolso" ? "Reembolso" : "Adiantamento"),
        entrada: nat === "reembolso" ? valor : 0, saida: nat === "vale" ? valor : 0, removivel: false, origemTipo: "expense" as const,
      };
    }),
  ];
  return list.sort((a, b) => a.data.localeCompare(b.data));
}
