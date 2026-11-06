import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { resolvePrintHeaders } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import type { MovMotorista, ResumoAcerto } from "@/services/rh/acertoMotoristaService";

const NAT: Record<MovMotorista["natureza"], string> = { comissao: "Comissão", reembolso: "Reembolso", vale: "Vale / Adiantamento", desconto: "Desconto", salario: "Salário base" };
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const dt = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Baixa direto o PDF do acerto do motorista, com o mesmo visual da tela de movimentações. */
export async function baixarAcertoMotoristaPdf(o: { nome: string; inicio: string; fim: string; vencimento?: string | null; movs: MovMotorista[]; resumo: ResumoAcerto; liquido: number }) {
  const ORD: Record<string, number> = { salario: 0, comissao: 1, reembolso: 2, vale: 3, desconto: 4 };
  const ordenar = (l: MovMotorista[]) => [...l].sort((a, b) => (ORD[a.natureza] - ORD[b.natureza]) || String(a.data).localeCompare(String(b.data)));
  const entradasL = ordenar(o.movs.filter((m) => m.entrada > 0));
  const saidasL = ordenar(o.movs.filter((m) => !(m.entrada > 0)));
  const linhas = (l: MovMotorista[], vazio: string) => l.map((m) => {
    const entrada = m.entrada > 0;
    return `<tr class="${entrada ? "in" : "out"}">
      <td class="nowrap">${dt(m.data)}</td>
      <td class="nowrap"><span class="seta ${entrada ? "up" : "down"}">${entrada ? "▲" : "▼"}</span><span class="badge">${NAT[m.natureza]}</span></td>
      <td>${esc(m.descricao)}</td>
      <td class="r mono pos">${m.entrada ? brl(m.entrada) : ""}</td>
      <td class="r mono neg">${m.saida ? brl(m.saida) : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:10px">${vazio}</td></tr>`;
  const totE = o.movs.reduce((s, m) => s + m.entrada, 0), totS = o.movs.reduce((s, m) => s + m.saida, 0);
  const saldo = totE - totS;
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Acerto ${esc(o.nome)}</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#1c2733;margin:0}
    .doc-page{width:186mm;padding:0}
    .doc-page>table:first-of-type>tbody>tr>td:last-child{padding-right:8px!important}
    .doc-page>table:first-of-type>tbody>tr>td:last-child>div:nth-child(2){font-family:Arial,Helvetica,sans-serif!important;font-size:11px!important;line-height:1.5;white-space:nowrap}
    h2{font-size:13px;margin:10px 0 6px;color:#2B4C7E}
    .info{display:flex;gap:24px;margin:6px 0 10px}
    .nowrap{white-space:nowrap}
    .mono{font-family:"Courier New",monospace}
    table.mov{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dfe4ec;border-radius:8px;overflow:hidden}
    table.mov th{background:#f1f4f9;color:#5b6b7f;text-align:left;padding:6px 8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #dfe4ec}
    table.mov td{padding:5px 8px;vertical-align:top;border-bottom:1px solid #e7ebf1}
    table.mov tbody tr:last-child td{border-bottom:none}
    tr.in td{background:#e9f6ee}
    tr.out td{background:#fdf4d2}
    .seta{display:inline-block;width:14px;font-size:9px}
    .seta.up{color:#1e7e38}.seta.down{color:#dc2626}
    .badge{display:inline-block;border:1px solid #9aa7b8;border-radius:5px;padding:1px 6px;font-size:9.5px;color:#37465a;background:#fff;white-space:nowrap}
    .r{text-align:right;white-space:nowrap}
    .pos{color:#1e7e38}.neg{color:#dc2626}
    table.mov tfoot td{background:#f8fafc;border-top:2px solid #2B4C7E;font-weight:bold;padding:6px 8px}
    .legenda{margin:6px 2px 0;font-size:9px;color:#6b7280;display:flex;gap:16px}
    .legenda span{display:inline-flex;align-items:center;gap:5px}
    .sw{display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid}
    .sw.in{background:#bfe6cc;border-color:#1e7e38}
    .sw.out{background:#f5e19a;border-color:#c9a106}
    .resumo{margin-top:14px;width:60%;margin-left:auto;border-collapse:collapse}
    .resumo td{padding:4px 6px;border-bottom:1px solid #e5e7eb}
    .saldo td{font-size:13px;font-weight:bold;color:#2B4C7E;border-top:2px solid #2B4C7E}
    .ass{margin-top:28px;display:flex;flex-direction:column;align-items:center}
    .ass p{font-size:9.5px;color:#374151;text-align:left;line-height:1.45;margin:0 0 42px;width:92%;box-sizing:border-box;padding-right:12px;align-self:flex-start}
    .ass .linha{width:60%;border-top:1px solid #111;text-align:center;padding-top:4px;font-size:10.5px}
    .ass .linha small{display:block;font-size:9px;color:#6b7280}
  </style></head><body><div class="doc-page">
  <!--PRINT_HEADER:${encodeURIComponent(JSON.stringify({ title: "Acerto do Motorista", subtitle: `${dt(o.inicio)} a ${dt(o.fim)}` }))}-->
  <div class="info"><div><b>Motorista:</b> ${esc(o.nome)}</div><div><b>Período:</b> ${dt(o.inicio)} a ${dt(o.fim)}</div>${o.vencimento ? `<div><b>Vencimento:</b> ${dt(o.vencimento)}</div>` : ""}</div>
  <h2>Entradas (créditos)</h2>
  <table class="mov"><thead><tr><th style="width:12%">Data</th><th style="width:24%">Tipo</th><th>Descrição</th><th class="r" style="width:15%">Entrada (crédito)</th><th class="r" style="width:15%">Saída (débito)</th></tr></thead>
  <tbody>${linhas(entradasL, "Nenhuma entrada no período.")}</tbody>
  <tfoot><tr><td colspan="3" style="text-align:right;color:#5b6b7f">Subtotal de entradas</td><td class="r mono pos">${brl(totE)}</td><td></td></tr></tfoot></table>
  <h2>Saídas (débitos)</h2>
  <table class="mov"><thead><tr><th style="width:12%">Data</th><th style="width:24%">Tipo</th><th>Descrição</th><th class="r" style="width:15%">Entrada (crédito)</th><th class="r" style="width:15%">Saída (débito)</th></tr></thead>
  <tbody>${linhas(saidasL, "Nenhuma saída no período.")}</tbody>
  <tfoot><tr><td colspan="3" style="text-align:right;color:#5b6b7f">Subtotal de saídas</td><td></td><td class="r mono neg">${brl(totS)}</td></tr>
  <tr><td colspan="3" style="text-align:right;color:#5b6b7f">Entradas ${brl(totE)} − Saídas ${brl(totS)}</td><td colspan="2" class="r">Saldo do acerto: <span class="mono ${saldo < 0 ? "neg" : ""}">${brl(saldo)}</span></td></tr></tfoot></table>
  <div class="legenda"><span><span class="sw in"></span>Entrada (crédito)</span><span><span class="sw out"></span>Saída (débito)</span></div>
  <table class="resumo">
    ${o.resumo.salario > 0 ? `<tr><td>(+) Salário base</td><td class="r">${brl(o.resumo.salario)}</td></tr>` : ""}
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
