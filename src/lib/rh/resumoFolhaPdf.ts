import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { resolvePrintHeaders } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import { totalizarResumoFolha, type ResumoFolhaLinha } from "./resumoFolha";

const esc = (s: string) => String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
const dt = (s: string) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const valores = (l: ReturnType<typeof totalizarResumoFolha>) => [l.base, l.comissoes, l.reembolsos, l.adiantamentos, l.descontos, l.liquido].map((v) => `<td class="r">${brl(v)}</td>`).join("");

export async function baixarResumoFolhaPdf(mes: string, linhas: ResumoFolhaLinha[]) {
  if (!linhas.length) return;
  const totais = totalizarResumoFolha(linhas);
  const competencia = mes.split("-").reverse().join("/");
  const paginas: string[] = [];
  for (let offset = 0; offset < linhas.length; offset += 12) {
    const lote = linhas.slice(offset, offset + 12);
    const ultima = offset + 12 >= linhas.length;
    paginas.push(`<section class="doc-page">
      <!--PRINT_HEADER:${encodeURIComponent(JSON.stringify({ title: "Resumo da Folha", subtitle: `Competência ${competencia}` }))}-->
      <p>Folhas administrativas / operacionais e acertos de motoristas · ${linhas.length} fechamento(s) · Página ${paginas.length + 1}/${Math.ceil(linhas.length / 12)}</p>
      <table><colgroup><col style="width:22%"><col style="width:15%"><col style="width:9%">${Array.from({ length: 6 }, () => '<col style="width:9%">').join("")}</colgroup>
      <thead><tr><th>Colaborador / Tipo</th><th>Período / Vencimento</th><th>Situação</th><th class="r">Base</th><th class="r">Comissões</th><th class="r">Reembolsos</th><th class="r">Adiant. / Vales</th><th class="r">Descontos</th><th class="r">Líquido</th></tr></thead>
      <tbody>${lote.map((l) => `<tr><td><b>${esc(l.nome)}</b><small>${esc(l.tipo)}</small>${l.chavePix ? `<small>Chave Pix: ${esc(l.chavePix)}</small>` : ""}</td><td>${dt(l.inicio)} a ${dt(l.fim)}<small>Venc.: ${dt(l.vencimento)}</small></td><td>${esc(l.situacao)}</td>${valores(l)}</tr>`).join("")}</tbody>
      ${ultima ? `<tfoot><tr><td colspan="3">Total geral — ${linhas.length} fechamento(s)</td>${valores(totais)}</tr></tfoot>` : ""}</table>
      ${ultima ? `<div class="saldo">Total líquido dos fechamentos: R$ ${brl(totais.liquido)}</div>` : ""}
      ${printBrandFooterHtml()}
    </section>`);
  }
  let html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo da Folha ${esc(competencia)}</title><style>
    *{box-sizing:border-box}body{font:10px Arial,Helvetica,sans-serif;color:#111;margin:0}.doc-page{width:277mm;padding:0}
    .doc-page>table:first-of-type>tbody>tr>td:last-child{padding-right:8px!important}
    .doc-page>table:first-of-type>tbody>tr>td:last-child>div:nth-child(2){font-family:Arial,Helvetica,sans-serif!important;font-size:11px!important;line-height:1.5;white-space:nowrap}
    p{margin:10px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;background:#edf0f4;font-size:9px;padding:6px 4px}
    td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere}small{display:block;font-size:9px;margin-top:3px}
    .r{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;border-top:2px solid #333}.saldo{text-align:right;font-size:13px;font-weight:bold;margin:14px 0}
  </style></head><body>${paginas.join("")}</body></html>`;
  const logo = await getCurrentTenantLogoUrl();
  html = await resolvePrintHeaders(html, logo);
  await downloadHtmlAsPdf(html, `Resumo_Folha_${mes}.pdf`, { orientation: "landscape", marginMm: 10 });
}