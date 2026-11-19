// PDF da relação de veículos selecionados em Documentos e Multas.
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { buildPrintHeaderHtml, fetchMatrizHeader } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { formatCurrency } from "@/lib/masks";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface RelacaoLinha {
  plate: string; veiculo: string; renavam: string; alienacao: string; situacao: string;
  porAno: Record<number, number>; multas: number; total: number;
}

export async function exportFleetRelacaoPdf(linhas: RelacaoLinha[], anos: number[]) {
  const company = await fetchMatrizHeader();
  const anosDesc = [...anos].reverse();
  const m = (v: number) => (v ? formatCurrency(v) : "—");
  const soma = (f: (l: RelacaoLinha) => number) => linhas.reduce((t, l) => t + f(l), 0);
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relação de documentos e multas</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{width:1080px;font-family:Arial,sans-serif;font-size:8pt;color:#111}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #d1d5db;padding:3px 4px;text-align:left;vertical-align:top;word-break:break-word}
    th{background:#f3f4f6;font-weight:600}.r{text-align:right;white-space:nowrap}tfoot td{font-weight:700;background:#f9fafb}
  </style></head><body>
  ${buildPrintHeaderHtml({ company, title: "Relação de documentos e multas", subtitle: `${linhas.length} veículo(s) · ${quando}` })}
  <table><thead><tr><th style="width:70px">Placa</th><th style="width:130px">Veículo</th><th style="width:90px">RENAVAM</th><th style="width:120px">Alienação</th><th style="width:70px">Situação</th>
  ${anosDesc.map((a) => `<th class="r">IPVA/Lic. ${a}</th>`).join("")}<th class="r">Multas</th><th class="r">Total</th></tr></thead><tbody>
  ${linhas.map((l) => `<tr><td>${esc(l.plate)}</td><td>${esc(l.veiculo)}</td><td>${esc(l.renavam)}</td><td>${esc(l.alienacao)}</td><td>${esc(l.situacao)}</td>
    ${anosDesc.map((a) => `<td class="r">${m(l.porAno[a] || 0)}</td>`).join("")}<td class="r">${m(l.multas)}</td><td class="r">${m(l.total)}</td></tr>`).join("")}
  </tbody><tfoot><tr><td colspan="5">Total</td>${anosDesc.map((a) => `<td class="r">${formatCurrency(soma((l) => l.porAno[a] || 0))}</td>`).join("")}
  <td class="r">${formatCurrency(soma((l) => l.multas))}</td><td class="r">${formatCurrency(soma((l) => l.total))}</td></tr></tfoot></table>
  ${printBrandFooterHtml()}</body></html>`;
  await downloadHtmlAsPdf(html, `Relacao documentos e multas ${new Date().toISOString().slice(0, 10)}.pdf`, { orientation: "landscape" });
}
