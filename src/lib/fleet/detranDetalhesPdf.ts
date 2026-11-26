// PDF dos detalhes gravados de uma consulta ao Detran (sem nova chamada à API).
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { buildPrintHeaderHtml, fetchMatrizHeader } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { formatCurrency } from "@/lib/masks";
import { datasDebito } from "./multaDatas";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const rotulo = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const oculto = (k: string) => k.startsWith("normalizado_") || /url|receipt|codigo_verificacao/i.test(k);
const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);

function bloco(obj: Record<string, unknown>): string {
  const simples = Object.entries(obj).filter(([k, v]) => !oculto(k) && !vazio(v) && typeof v !== "object");
  const listas = Object.entries(obj).filter(([k, v]) => !oculto(k) && Array.isArray(v) && v.length);
  let h = simples.length ? `<table class="kv">${simples.map(([k, v]) => `<tr><th>${esc(rotulo(k))}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : "";
  for (const [k, arr] of listas as [string, any[]][]) {
    const objs = arr.filter((x) => x && typeof x === "object");
    if (!objs.length) { h += `<h3>${esc(rotulo(k))}</h3><p>${arr.map(esc).join(", ")}</p>`; continue; }
    const cols = [...new Set(objs.flatMap((o) => Object.keys(o)))].filter((c) => !oculto(c));
    h += `<h3>${esc(rotulo(k))}</h3><table class="grid"><tr>${cols.map((c) => `<th>${esc(rotulo(c))}</th>`).join("")}</tr>${objs.map((o) => `<tr>${cols.map((c) => `<td>${esc(typeof o[c] === "object" ? JSON.stringify(o[c]) : o[c])}</td>`).join("")}</tr>`).join("")}</table>`;
  }
  return h;
}

export async function exportDetranDetalhesPdf(c: { plate: string; uf: string; created_at: string; response: unknown; importacao: any }) {
  const quando = new Date(c.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const company = await fetchMatrizHeader();
  const debitos: any[] = c.importacao?.debitos ?? [];
  const itens = (Array.isArray(c.response) ? c.response : [c.response]).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Consulta Detran ${esc(c.plate)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{width:740px}body{font-family:Arial,sans-serif;font-size:9pt;color:#111}h2{font-size:11pt;margin:12px 0 4px}h3{font-size:9.5pt;margin:10px 0 3px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed}th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top;word-break:break-word}
    th{background:#f3f4f6;font-weight:600}.kv th{width:32%}.r{text-align:right}tfoot td{font-weight:700}
  </style></head><body>
  ${buildPrintHeaderHtml({ company, title: "Consulta de débitos — Detran", subtitle: `Placa ${esc(c.plate)} · ${esc(c.uf)} · ${quando}` })}
  <h2>Débitos identificados</h2>
  ${debitos.length ? `<table><tr><th style="width:12%">Tipo</th><th style="width:7%">Ano</th><th style="width:13%">Data da infração</th><th style="width:11%">Vencimento</th><th>Descrição</th><th class="r" style="width:14%">Valor</th></tr>
    ${debitos.map((d) => { const dt = datasDebito(d, c.response); return `<tr><td>${esc(d.tipo)}</td><td>${esc(d.ano)}</td><td>${esc(dt.infracao ?? "—")}</td><td>${esc(dt.vencimento ?? "—")}</td><td>${esc(d.descricao)}</td><td class="r">${formatCurrency(d.valor)}</td></tr>`; }).join("")}
    <tfoot><tr><td colspan="5">Total</td><td class="r">${formatCurrency(debitos.reduce((t, d) => t + Number(d.valor || 0), 0))}</td></tr></tfoot></table>` : "<p>Nenhum débito com valor identificado.</p>"}
  <h2>Resposta do Detran</h2>${itens.map(bloco).join("<hr/>")}
  ${printBrandFooterHtml()}</body></html>`;
  await downloadHtmlAsPdf(html, `Consulta Detran ${c.plate} ${c.created_at.slice(0, 10)}.pdf`);
}
