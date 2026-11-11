import { supabase } from "@/integrations/supabase/client";
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { resolvePrintHeaders } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import { quintoDiaUtilMesSeguinte } from "./quintoDiaUtil";

export type PrevisaoItem = { data: string; tipo: string; descricao: string; valor: number; parcela?: string };
export type PrevisaoMes = { mes: string; salario: number; descontos: PrevisaoItem[]; totalDescontos: number; liquido: number };

const TIPOS: Record<string, string> = { adiantamento: "Adiantamento", vale: "Vale", inss: "INSS", irrf: "IRRF", faltas: "Faltas", multas: "Multas", outros: "Outros", combustivel: "Combustível", credito_trabalhador: "Crédito do Trabalhador", avaria: "Avaria" };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Agrupa os descontos futuros por mês (a partir de `mesInicial`, AAAA-MM) e projeta o salário a receber em cada mês. */
export function montarPrevisao(mesInicial: string, salario: number, itens: PrevisaoItem[]): PrevisaoMes[] {
  const futuros = itens.filter((i) => i.data.slice(0, 7) >= mesInicial);
  const ultimo = futuros.reduce((m, i) => (i.data.slice(0, 7) > m ? i.data.slice(0, 7) : m), mesInicial);
  const meses: PrevisaoMes[] = [];
  let [y, m] = mesInicial.split("-").map(Number);
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    if (mes > ultimo) break;
    const descontos = futuros.filter((i) => i.data.slice(0, 7) === mes).sort((a, b) => a.data.localeCompare(b.data));
    const totalDescontos = r2(descontos.reduce((s, i) => s + i.valor, 0));
    meses.push({ mes, salario: r2(salario), descontos, totalDescontos, liquido: r2(salario - totalDescontos) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return meses;
}

/** Parcelas/descontos ainda não usados em nenhum acerto nem folha. */
export async function carregarDescontosFuturos(colabId: string, desde: string): Promise<PrevisaoItem[]> {
  const { data, error } = await (supabase.from("descontos_folha" as any) as any)
    .select("id, tipo, valor, descricao, data_referencia, parcela_numero, parcelas_total")
    .eq("colaborador_id", colabId).is("folha_pagamento_id", null).gte("data_referencia", desde).order("data_referencia");
  if (error) throw error;
  const rows = (data || []) as any[];
  const usados = new Set<string>();
  if (rows.length) {
    const { data: v, error: e2 } = await (supabase.from("acerto_movimentos" as any) as any).select("origem_id").in("origem_id", rows.map((r) => r.id));
    if (e2) throw e2;
    (v || []).forEach((x: any) => usados.add(x.origem_id));
  }
  const livres: PrevisaoItem[] = rows.filter((r) => !usados.has(r.id)).map((r) => ({
    data: r.data_referencia, tipo: TIPOS[r.tipo] || r.tipo, descricao: r.descricao || "", valor: Number(r.valor || 0),
    parcela: r.parcela_numero && r.parcelas_total ? `${r.parcela_numero}/${r.parcelas_total}` : undefined,
  }));
  return [...livres, ...(await carregarDebitosDosAcertos(colabId, desde))];
}

/** Débitos (vales/adiantamentos/descontos) já incluídos nos acertos dos meses do relatório. */
async function carregarDebitosDosAcertos(colabId: string, desde: string): Promise<PrevisaoItem[]> {
  const { data, error } = await (supabase.from("acerto_movimentos" as any) as any)
    .select("periodo_inicio, origem_id, origem_tipo, valor_desconto, parcelas_total, natureza")
    .eq("colaborador_id", colabId).gte("periodo_inicio", desde).in("natureza", ["vale", "desconto"]);
  if (error) throw error;
  const movs = (data || []) as any[];
  const descIds = movs.filter((m) => m.origem_tipo === "desconto").map((m) => m.origem_id);
  const expIds = movs.filter((m) => m.origem_tipo === "expense").map((m) => m.origem_id);
  const descs = new Map<string, any>(); const exps = new Map<string, any>();
  if (descIds.length) {
    const { data: d, error: e } = await (supabase.from("descontos_folha" as any) as any).select("id, tipo, valor, descricao, parcela_numero, parcelas_total").in("id", descIds);
    if (e) throw e; (d || []).forEach((x: any) => descs.set(x.id, x));
  }
  if (expIds.length) {
    const { data: d, error: e } = await (supabase.from("expenses" as any) as any).select("id, descricao, valor_total").in("id", expIds);
    if (e) throw e; (d || []).forEach((x: any) => exps.set(x.id, x));
  }
  const out: PrevisaoItem[] = [];
  for (const m of movs) {
    if (m.origem_tipo === "desconto") {
      const d = descs.get(m.origem_id); if (!d) continue;
      out.push({ data: m.periodo_inicio, tipo: TIPOS[d.tipo] || d.tipo, descricao: d.descricao || "", valor: Number(m.valor_desconto ?? d.valor ?? 0),
        parcela: d.parcela_numero && d.parcelas_total ? `${d.parcela_numero}/${d.parcelas_total}` : undefined });
    } else if (m.origem_tipo === "expense") {
      const x = exps.get(m.origem_id); if (!x) continue;
      const tot = Number(m.parcelas_total || 1);
      out.push({ data: m.periodo_inicio, tipo: m.natureza === "vale" ? "Adiantamento" : "Outros", descricao: x.descricao || "",
        valor: Number(m.valor_desconto ?? x.valor_total ?? 0), parcela: tot > 1 ? `1/${tot}` : undefined });
    }
  }
  return out;
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const dt = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

export async function baixarPrevisaoColaboradorPdf(nome: string, meses: PrevisaoMes[]) {
  const totDesc = r2(meses.reduce((s, m) => s + m.totalDescontos, 0));
  const totSal = r2(meses.reduce((s, m) => s + m.salario, 0));
  const blocos = meses.map((m) => { const pg = dt(quintoDiaUtilMesSeguinte(`${m.mes}-01`)); return `<div class="mes"><h3>${nomeMes(m.mes)} <small style="font-weight:normal;color:#5b6b7f">· pagamento previsto ${pg}</small></h3><table class="mov"><colgroup><col style="width:14%"><col style="width:20%"><col style="width:44%"><col style="width:22%"></colgroup>
    <thead><tr><th>Pagamento</th><th>Tipo</th><th>Descrição</th><th class="r">Valor</th></tr></thead><tbody>
    <tr><td>${pg}</td><td>Salário base</td><td>Valor a receber no mês</td><td class="r pos">R$ ${brl(m.salario)}</td></tr>
    ${m.descontos.map((d) => `<tr><td>${pg}</td><td>${esc(d.tipo)}</td><td>${esc(d.descricao)}${d.parcela && !/parcela\s*\d/i.test(d.descricao) ? ` — parcela ${d.parcela}` : ""}</td><td class="r neg">R$ ${brl(d.valor)}</td></tr>`).join("")}
    </tbody><tfoot><tr><td colspan="3">Débitos R$ ${brl(m.totalDescontos)} · Previsão líquida</td><td class="r liq">R$ ${brl(m.liquido)}</td></tr></tfoot></table></div>`; }).join("");
  let html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Previsões ${esc(nome)}</title><style>
    *{box-sizing:border-box}body{font:9px Arial,Helvetica,sans-serif;color:#1c2733;margin:0}.doc-page{width:190mm}
    p{margin:6px 0 10px;font-size:9.5px;color:#5b6b7f}h3{font-size:11px;color:#2B4C7E;margin:12px 0 4px}.mes{break-inside:avoid}
    table.mov{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;border:1px solid #dfe4ec;border-radius:8px;overflow:hidden}
    table.mov th{background:#f1f4f9;color:#5b6b7f;text-align:left;padding:5px 4px;font-size:7.5px;text-transform:uppercase;border-bottom:1px solid #dfe4ec}
    table.mov td{padding:4px;border-bottom:1px solid #e7ebf1;overflow-wrap:anywhere}
    table.mov tfoot td{background:#f8fafc;border-top:2px solid #2B4C7E;font-weight:bold}
    .r{text-align:right;white-space:nowrap}.pos{color:#1e7e38}.neg{color:#dc2626}.liq{color:#2B4C7E}
    .resumo{margin-top:14px;width:60%;margin-left:auto;border-collapse:collapse;font-size:11px}.resumo td{padding:4px 6px;border-bottom:1px solid #e5e7eb}
    .saldo td{font-size:13px;font-weight:bold;color:#2B4C7E;border-top:2px solid #2B4C7E}
  </style></head><body><section class="doc-page">
    <!--PRINT_HEADER:${encodeURIComponent(JSON.stringify({ title: "Previsões do Colaborador", subtitle: nome }))}-->
    <p>Vencimentos futuros em aberto, mês a mês, a partir de ${nomeMes(meses[0].mes)}. Inclui os débitos já lançados nos acertos dos meses exibidos.</p>
    ${blocos}
    <table class="resumo"><tr><td>(+) Salários previstos</td><td class="r pos">R$ ${brl(totSal)}</td></tr>
    <tr><td>(−) Parcelas e descontos a descontar</td><td class="r neg">R$ ${brl(totDesc)}</td></tr>
    <tr class="saldo"><td>Previsão líquida total</td><td class="r">R$ ${brl(totSal - totDesc)}</td></tr></table>
    ${printBrandFooterHtml()}</section></body></html>`;
  html = await resolvePrintHeaders(html, await getCurrentTenantLogoUrl());
  await downloadHtmlAsPdf(html, `Previsoes_${nome.replace(/\s+/g, "_")}.pdf`, { orientation: "portrait", marginMm: 10 });
}
