import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { resolvePrintHeaders } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import { totalizarResumoFolha, type ResumoFolhaLinha } from "./resumoFolha";

const esc = (s: string) => String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
const dt = (s: string) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const valores = (l: ReturnType<typeof totalizarResumoFolha>) => {
  const cls = ["", "pos", "pos", "neg", "neg", "liq"];
  return [l.base, l.comissoes, l.reembolsos, l.adiantamentos, l.descontos, l.liquido].map((v, i) => `<td class="r mono ${cls[i]}">${brl(v)}</td>`).join("");
};

export async function baixarResumoFolhaPdf(mes: string, linhas: ResumoFolhaLinha[]) {
  if (!linhas.length) return;
  const totais = totalizarResumoFolha(linhas);
  const competencia = mes.split("-").reverse().join("/");
  const paginas: string[] = [];
  for (let offset = 0; offset < linhas.length; offset += 16) {
    const lote = linhas.slice(offset, offset + 16);
    const ultima = offset + 16 >= linhas.length;
    paginas.push(`<section class="doc-page">
      <!--PRINT_HEADER:${encodeURIComponent(JSON.stringify({ title: "Resumo da Folha", subtitle: `Competência ${competencia}` }))}-->
      <p>Folhas administrativas / operacionais e acertos de motoristas · ${linhas.length} fechamento(s) · Página ${paginas.length + 1}/${Math.ceil(linhas.length / 16)}</p>
      <table class="mov"><colgroup><col style="width:24%"><col style="width:14%"><col style="width:8%">${Array.from({ length: 6 }, () => '<col style="width:9%">').join("")}</colgroup>
      <thead><tr><th>Colaborador / Tipo</th><th>Período / Venc.</th><th>Situação</th><th class="r">Base</th><th class="r">Comissões</th><th class="r">Reembolsos</th><th class="r">Adiant./Vales</th><th class="r">Descontos</th><th class="r">Líquido</th></tr></thead>
      <tbody>${lote.map((l, i) => `<tr class="${i % 2 ? "alt" : ""}"><td><b>${esc(l.nome)}</b><small>${esc(l.tipo)}</small>${l.chavePix ? `<small class="pix">Pix (${esc(l.chavePix.tipo)}): <b>${esc(l.chavePix.valor)}</b></small>` : ""}</td><td>${dt(l.inicio)} a ${dt(l.fim)}<small>Venc.: ${dt(l.vencimento)}</small></td><td>${esc(l.situacao)}</td>${valores(l)}</tr>`).join("")}</tbody>
      ${ultima ? `<tfoot><tr><td colspan="3">Total geral — ${linhas.length} fechamento(s)</td>${valores(totais)}</tr></tfoot>` : ""}</table>
      ${ultima ? `<div class="legenda"><span><span class="sw in"></span>Crédito</span><span><span class="sw out"></span>Débito</span></div>
      <table class="resumo">
        <tr><td>(+) Salário base</td><td class="r">R$ ${brl(totais.base)}</td></tr>
        <tr><td>(+) Comissões</td><td class="r pos">R$ ${brl(totais.comissoes)}</td></tr>
        <tr><td>(+) Reembolsos</td><td class="r pos">R$ ${brl(totais.reembolsos)}</td></tr>
        <tr><td>(−) Adiantamentos / Vales</td><td class="r neg">R$ ${brl(totais.adiantamentos)}</td></tr>
        <tr><td>(−) Descontos</td><td class="r neg">R$ ${brl(totais.descontos)}</td></tr>
        <tr class="saldo"><td>Total líquido a pagar</td><td class="r">R$ ${brl(totais.liquido)}</td></tr>
      </table>` : ""}
      ${printBrandFooterHtml()}
    </section>`);
  }
  let html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo da Folha ${esc(competencia)}</title><style>
    *{box-sizing:border-box}body{font:9px Arial,Helvetica,sans-serif;color:#1c2733;margin:0}.doc-page{width:190mm;padding:0}
    .doc-page>table:first-of-type>tbody>tr>td:last-child{padding-right:8px!important}
    .doc-page>table:first-of-type>tbody>tr>td:last-child>div:nth-child(2){font-family:Arial,Helvetica,sans-serif!important;font-size:11px!important;line-height:1.5;white-space:nowrap}
    p{margin:6px 0 10px;font-size:9.5px;color:#5b6b7f}
    .mono{font-family:"Courier New",monospace}
    table.mov{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;border:1px solid #dfe4ec;border-radius:8px;overflow:hidden;color:#1c2733}
    table.mov th{background:#f1f4f9;color:#5b6b7f;text-align:left;padding:6px 4px;font-size:7.5px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #dfe4ec}
    table.mov td{padding:5px 4px;vertical-align:top;border-bottom:1px solid #e7ebf1;overflow-wrap:anywhere}
    table.mov tbody tr:last-child td{border-bottom:none}
    table.mov tbody tr.alt td{background:#f8fafc}
    small{display:block;font-size:8px;margin-top:2px;color:#5b6b7f}small.pix{color:#2B4C7E}
    .r{text-align:right;white-space:nowrap}.pos{color:#1e7e38}.neg{color:#dc2626}.liq{color:#2B4C7E;font-weight:bold}
    table.mov tfoot td{background:#f8fafc;border-top:2px solid #2B4C7E;font-weight:bold;padding:6px 4px}
    .legenda{margin:6px 2px 0;font-size:9px;color:#6b7280;display:flex;gap:16px}
    .legenda span{display:inline-flex;align-items:center;gap:5px}
    .sw{display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid}
    .sw.in{background:#bfe6cc;border-color:#1e7e38}.sw.out{background:#fecaca;border-color:#dc2626}
    .resumo{margin-top:14px;width:60%;margin-left:auto;border-collapse:collapse;font-size:11px;color:#1c2733}
    .resumo td{padding:4px 6px;border-bottom:1px solid #e5e7eb}
    .saldo td{font-size:13px;font-weight:bold;color:#2B4C7E;border-top:2px solid #2B4C7E}
  </style></head><body>${paginas.join("")}</body></html>`;
  const logo = await getCurrentTenantLogoUrl();
  html = await resolvePrintHeaders(html, logo);
  await downloadHtmlAsPdf(html, `Resumo_Folha_${mes}.pdf`, { orientation: "portrait", marginMm: 10 });
}