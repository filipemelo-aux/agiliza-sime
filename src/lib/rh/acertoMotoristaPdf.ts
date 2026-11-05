import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { resolvePrintHeaders } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import type { MovMotorista, ResumoAcerto } from "@/services/rh/acertoMotoristaService";

const NAT: Record<MovMotorista["natureza"], string> = { comissao: "Comissão", reembolso: "Reembolso", vale: "Vale / Adiantamento", desconto: "Desconto" };
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const dt = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Baixa direto o PDF do acerto do motorista (movimentações detalhadas + saldo a receber). */
export async function baixarAcertoMotoristaPdf(o: { nome: string; inicio: string; fim: string; vencimento?: string | null; movs: MovMotorista[]; resumo: ResumoAcerto; liquido: number }) {
  const rows = o.movs.map((m) => `<tr><td>${dt(m.data)}</td><td>${NAT[m.natureza]}</td><td>${esc(m.descricao)}</td><td class="r">${m.entrada ? brl(m.entrada) : ""}</td><td class="r neg">${m.saida ? brl(m.saida) : ""}</td></tr>`).join("")
    || `<tr><td colspan="5" style="text-align:center;color:#6b7280">Nenhuma movimentação.</td></tr>`;
  const totE = o.movs.reduce((s, m) => s + m.entrada, 0), totS = o.movs.reduce((s, m) => s + m.saida, 0);
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Acerto ${esc(o.nome)}</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0}
    .doc-page{width:186mm;padding:0}
    .doc-page>table:first-of-type>tbody>tr>td:last-child{padding-right:8px!important}
    .doc-page>table:first-of-type>tbody>tr>td:last-child>div:nth-child(2){font-family:Arial,Helvetica,sans-serif!important;font-size:11px!important;line-height:1.5;white-space:nowrap}
    h2{font-size:13px;margin:10px 0 4px;color:#2B4C7E}
    .info{display:flex;gap:24px;margin:6px 0 10px}
    table.mov{width:100%;border-collapse:collapse}
    table.mov th{background:#2B4C7E;color:#fff;text-align:left;padding:5px;font-size:10px}
    table.mov td{border-bottom:1px solid #e5e7eb;padding:4px 5px;vertical-align:top}
    .r{text-align:right;white-space:nowrap}.neg{color:#b91c1c}
    tfoot td{font-weight:bold;border-top:2px solid #111}
    .resumo{margin-top:14px;width:60%;margin-left:auto;border-collapse:collapse}
    .resumo td{padding:4px 6px;border-bottom:1px solid #e5e7eb}
    .saldo td{font-size:13px;font-weight:bold;color:#2B4C7E;border-top:2px solid #2B4C7E}
    .ass{margin-top:28px;display:flex;flex-direction:column;align-items:center}
    .ass p{font-size:9.5px;color:#374151;text-align:justify;line-height:1.45;margin:0 0 42px;width:100%}
    .ass .linha{width:60%;border-top:1px solid #111;text-align:center;padding-top:4px;font-size:10.5px}
    .ass .linha small{display:block;font-size:9px;color:#6b7280}
  </style></head><body><div class="doc-page">
  <!--PRINT_HEADER:${encodeURIComponent(JSON.stringify({ title: "Acerto do Motorista", subtitle: `${dt(o.inicio)} a ${dt(o.fim)}` }))}-->
  <div class="info"><div><b>Motorista:</b> ${esc(o.nome)}</div><div><b>Período:</b> ${dt(o.inicio)} a ${dt(o.fim)}</div>${o.vencimento ? `<div><b>Vencimento:</b> ${dt(o.vencimento)}</div>` : ""}</div>
  <h2>Movimentações</h2>
  <table class="mov"><thead><tr><th style="width:14%">Data</th><th style="width:18%">Tipo</th><th>Descrição</th><th class="r" style="width:14%">Entrada</th><th class="r" style="width:14%">Saída</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td colspan="3">Totais</td><td class="r">${brl(totE)}</td><td class="r neg">${brl(totS)}</td></tr></tfoot></table>
  <table class="resumo">
    <tr><td>(+) Comissões</td><td class="r">${brl(o.resumo.comissoes)}</td></tr>
    <tr><td>(+) Reembolsos</td><td class="r">${brl(o.resumo.reembolsos)}</td></tr>
    <tr><td>(−) Adiantamentos / Vales</td><td class="r neg">${brl(o.resumo.vales)}</td></tr>
    <tr><td>(−) Descontos</td><td class="r neg">${brl(o.resumo.descontos)}</td></tr>
    <tr class="saldo"><td>Saldo a receber</td><td class="r">${brl(o.liquido)}</td></tr>
  </table>
  <div class="ass"><p>Declaro que conferi as movimentações acima referentes ao período de ${dt(o.inicio)} a ${dt(o.fim)} e que estou de acordo com os valores informados, inclusive com o saldo a receber de ${brl(o.liquido)}.</p><div class="linha">${esc(o.nome)}<small>Assinatura do motorista</small></div></div>
  ${printBrandFooterHtml()}
  </div></body></html>`;
  let logo: string | null = null;
  try { logo = await getCurrentTenantLogoUrl(); } catch { /* sem logo */ }
  html = await resolvePrintHeaders(html, logo);
  const safe = o.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_");
  await downloadHtmlAsPdf(html, `Acerto_${safe}_${o.inicio}.pdf`, { marginMm: 6 });
}
