// PDF da relação de veículos selecionados em Documentos e Multas (A4 retrato).
// As linhas são empacotadas em páginas (.doc-page) para nenhum veículo ser cortado na quebra.
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { buildPrintHeaderHtml, fetchMatrizHeader } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { formatCurrency } from "@/lib/masks";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface RelacaoLinha {
  plate: string; veiculo: string; renavam: string; chassi: string; alienacao: string; situacao: string;
  porAno: Record<number, number>; multas: number; total: number;
  /** Rótulo do conjunto (placas vinculadas entre si); vazio quando avulso. */
  conjunto?: string;
}

export const H_GRUPO = 20;

/**
 * Agrupa as placas vinculadas entre si (qualquer vínculo, direto ou indireto).
 * `vinculos` são pares de placas; a ordem de `ordemTracao` (placas de tração) vem primeiro no grupo.
 */
export function agruparConjuntos(linhas: RelacaoLinha[], vinculos: [string, string][], tracao: Set<string> = new Set()): RelacaoLinha[] {
  const norm = (p: string) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const sel = new Set(linhas.map((l) => norm(l.plate)));
  const pai = new Map<string, string>();
  const raiz = (x: string): string => { let r = x; while (pai.get(r) && pai.get(r) !== r) r = pai.get(r)!; return r; };
  sel.forEach((p) => pai.set(p, p));
  for (const [a0, b0] of vinculos) {
    const a = norm(a0), b = norm(b0);
    if (a === b || !sel.has(a) || !sel.has(b)) continue;
    const ra = raiz(a), rb = raiz(b);
    if (ra !== rb) pai.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const grupos = new Map<string, RelacaoLinha[]>();
  for (const l of linhas) {
    const r = raiz(norm(l.plate));
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r)!.push(l);
  }
  const tr = new Set([...tracao].map(norm));
  const ordenar = (g: RelacaoLinha[]) => [...g].sort((a, b) =>
    (tr.has(norm(b.plate)) ? 1 : 0) - (tr.has(norm(a.plate)) ? 1 : 0) || String(a.plate).localeCompare(String(b.plate)));
  return [...grupos.values()].map(ordenar)
    .sort((a, b) => (tr.has(norm(b[0].plate)) ? 1 : 0) - (tr.has(norm(a[0].plate)) ? 1 : 0)
      || String(a[0].plate).localeCompare(String(b[0].plate)))
    .flatMap((g) => {
      const rot = g.length > 1 ? g.map((l) => l.plate).join(" + ") : "";
      return g.map((l) => ({ ...l, conjunto: rot }));
    });
}
export interface RelacaoOpcoes { veiculo: boolean; renavam: boolean; chassi: boolean; alienacao: boolean; situacao: boolean; debitos: boolean }
export const OPCOES_PADRAO: RelacaoOpcoes = { veiculo: true, renavam: true, chassi: true, alienacao: true, situacao: true, debitos: true };

// ---------- Geometria da página (A4 retrato) ----------
export const MARGIN_MM = 12;
const PAGE_H_MM = 297;
const BODY_W_PX = 700; // 700px ≈ 185,2mm, dentro da área útil de 186mm
const USABLE_H_PX = Math.floor(((PAGE_H_MM - MARGIN_MM * 2) / 25.4) * 96) - 8; // ≈ 1023px

// Alturas estimadas (px) usadas para empacotar as linhas.
// Valores medidos no HTML real: cabeçalho 88, barra de continuação 28, rodapé+paginação 59,
// cabeçalho da tabela 20, bloco de totais 64, linha de identificação 18 (+13 por linha extra de texto),
// linha de débitos 31.
export const H_HEADER = 122, H_CONT = 38, H_FOOTER = 62, H_THEAD = 24, H_TOT = 78;
export const H_ID = 18, H_LINHA_EXTRA = 13, H_DEB = 31;

export interface PaginaRelacao { linhas: RelacaoLinha[]; altura: number }

interface Col { key: keyof RelacaoOpcoes; label: string; width: string; get: (l: RelacaoLinha) => string }
const COLS: Col[] = [
  { key: "veiculo", label: "Veículo", width: "22%", get: (l) => l.veiculo },
  { key: "renavam", label: "RENAVAM", width: "12%", get: (l) => l.renavam },
  { key: "chassi", label: "Chassi", width: "19%", get: (l) => l.chassi },
  { key: "alienacao", label: "Alienação", width: "26%", get: (l) => l.alienacao },
  { key: "situacao", label: "Situação", width: "12%", get: (l) => l.situacao },
];
const SITUACAO_CLASSE: Record<string, string> = { "Vencido": "st-v", "A vencer": "st-a", "Em dia": "st-e", "Sem registro": "st-n" };

/** Um veículo só ganha a linha de débitos quando tem algo em aberto. */
export function temDebitos(l: RelacaoLinha, op: RelacaoOpcoes): boolean {
  if (!op.debitos) return false;
  return l.total > 0 || l.multas > 0 || Object.values(l.porAno || {}).some((v) => v > 0);
}

/** Linhas que o texto ocupa na coluna (aprox. 20 caracteres em Veículo, 22 em Alienação). */
const linhasDeTexto = (t: string, chars: number) => Math.max(1, Math.ceil((t || "").trim().length / chars));

const alturaLinha = (l: RelacaoLinha, op: RelacaoOpcoes): number => {
  const li = Math.max(
    op.veiculo ? linhasDeTexto(l.veiculo, 20) : 1,
    op.alienacao ? linhasDeTexto(l.alienacao, 22) : 1,
  );
  return H_ID + H_LINHA_EXTRA * (li - 1) + (temDebitos(l, op) ? H_DEB : 0);
};

/** Altura disponível na página `i` (0 = primeira, com cabeçalho completo). */
export function capacidadePagina(i: number): number {
  return USABLE_H_PX - (i === 0 ? H_HEADER : H_CONT) - H_FOOTER - H_THEAD;
}

/** Distribui os veículos pelas páginas sem separar o bloco de identificação dos débitos. */
export function montarPaginas(linhas: RelacaoLinha[], op: RelacaoOpcoes): PaginaRelacao[] {
  const cap = (i: number) => capacidadePagina(i);
  const pages: PaginaRelacao[] = [];
  let cur: RelacaoLinha[] = [];
  let used = 0;
  // Blocos: um conjunto inteiro (com faixa de título) ou um veículo avulso.
  const blocos: RelacaoLinha[][] = [];
  for (const l of linhas) {
    const ult = blocos[blocos.length - 1];
    if (l.conjunto && ult && ult[0].conjunto === l.conjunto) ult.push(l); else blocos.push([l]);
  }
  for (const b of blocos) {
    const hs = b.map((l) => alturaLinha(l, op));
    const tot = hs.reduce((t, h) => t + h, 0) + (b[0].conjunto ? H_GRUPO : 0);
    if (cur.length && used + tot > cap(pages.length) && tot <= cap(pages.length + 1)) {
      pages.push({ linhas: cur, altura: used });
      cur = []; used = 0;
    }
    b.forEach((l, i) => {
      const h = hs[i] + (i === 0 && l.conjunto ? H_GRUPO : 0);
      if (cur.length && used + h > cap(pages.length)) { pages.push({ linhas: cur, altura: used }); cur = []; used = 0; }
      cur.push(l); used += h;
    });
  }
  if (cur.length) pages.push({ linhas: cur, altura: used });
  if (!pages.length) pages.push({ linhas: [], altura: 0 });

  // O bloco de totais fecha a relação: se não couber na última página, ganha a sua.
  if (linhas.some((l) => temDebitos(l, op))) {
    const last = pages[pages.length - 1];
    if (last.altura + H_TOT > cap(pages.length - 1)) pages.push({ linhas: [], altura: 0 });
  }
  return pages;
}

const rotulos = (anosDesc: number[]) => [...anosDesc.map((a) => `IPVA/Lic ${a}`), "Multas", "Total"];
const valores = (l: RelacaoLinha, anosDesc: number[], m: (v: number) => string) =>
  [...anosDesc.map((a) => m(l.porAno?.[a] || 0)), m(l.multas), m(l.total)];

const mini = (labels: string[], vals: string[]) =>
  `<table class="mini"><tr>${labels.map((x) => `<th>${x}</th>`).join("")}</tr><tr>${vals.map((v) => `<td class="r">${v}</td>`).join("")}</tr></table>`;

/** Monta o HTML completo (uma div .doc-page por página). */
export function montarHtmlRelacao(linhas: RelacaoLinha[], anos: number[], op: RelacaoOpcoes, company: { name: string; docLine: string; address: string }): string {
  const ordenadas = linhas.some((l) => l.conjunto) ? linhas : [...linhas].sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
  const anosDesc = op.debitos ? [...anos].sort((a, b) => b - a) : [];
  const cols = COLS.filter((c) => op[c.key]);
  const m = (v: number) => (v ? formatCurrency(v) : "—");
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const nCols = 1 + cols.length;
  const paginas = montarPaginas(ordenadas, op);
  const comDebitos = ordenadas.some((l) => temDebitos(l, op));
  const soma = (f: (l: RelacaoLinha) => number) => ordenadas.reduce((t, l) => t + f(l), 0);

  const celula = (c: Col, v: string) => {
    const t = (v || "").trim() || "—";
    if (c.key === "situacao") return `<span class="${SITUACAO_CLASSE[t] || "st-n"}">${esc(t)}</span>`;
    if (c.key === "alienacao") {
      if (/^alienad/i.test(t)) return `<span class="al">${esc(t)}</span>`;
      if (/^livre/i.test(t)) return `<span class="lv">${esc(t)}</span>`;
    }
    return esc(t);
  };

  const head = `<th class="pl" style="width:9%">Placa</th>${cols.map((c) => `<th style="width:${c.width}">${c.label}</th>`).join("")}`;
  const rowId = (l: RelacaoLinha) => `<tr${l.conjunto ? ' class="cj"' : ""}><td class="pl">${esc(l.plate)}</td>${cols.map((c) => `<td>${celula(c, c.get(l))}</td>`).join("")}</tr>`;
  const rowDeb = (l: RelacaoLinha) => `<tr class="db${l.conjunto ? " cj" : ""}"><td colspan="${nCols}" class="dc">${mini(rotulos(anosDesc), valores(l, anosDesc, m))}</td></tr>`;

  const totais = comDebitos ? `<div class="totbox">
    <div class="tot-h">Totais da relação · ${ordenadas.length} veículo(s)</div>
    ${mini(rotulos(anosDesc), rotulos(anosDesc).map((_, i) => (i < anosDesc.length
      ? m(soma((l) => l.porAno?.[anosDesc[i]] || 0))
      : m(soma((l) => (i === anosDesc.length ? l.multas : l.total))))))}
    <div class="tot-g">Total geral: ${formatCurrency(soma((l) => l.total))}</div>
  </div>` : "";

  const corpo = (p: PaginaRelacao) => p.linhas.length
    ? `<table class="rel"><thead><tr>${head}</tr></thead><tbody>${p.linhas.map((l, i) => (l.conjunto && (i === 0 || p.linhas[i - 1].conjunto !== l.conjunto) ? `<tr class="gr"><td colspan="${nCols}">Conjunto: ${esc(l.conjunto)}</td></tr>` : "") + rowId(l) + (temDebitos(l, op) ? rowDeb(l) : "")).join("")}</tbody></table>`
    : "";

  const pagina = (p: PaginaRelacao, i: number) => `<div class="doc-page">
    ${i === 0
      ? `<div class="hdr">${buildPrintHeaderHtml({ company, title: "Relação de documentos e multas", subtitle: `${ordenadas.length} veículo(s) · ${quando}` })}</div>`
      : `<div class="cont"><b>Relação de documentos e multas</b><span>${ordenadas.length} veículo(s) · ${quando}</span></div>`}
    ${corpo(p)}
    ${i === paginas.length - 1 ? totais : ""}
    <div class="pg">Página ${i + 1} de ${paginas.length}</div>
    ${printBrandFooterHtml()}
  </div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relação de documentos e multas</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0}
    body{width:${BODY_W_PX}px;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#111}
    .doc-page{width:${BODY_W_PX}px;background:#fff}
    .agiliza-brand-footer{box-sizing:content-box;height:24px;min-height:24px}
    .hdr{padding-right:12px}
    .cont{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;padding:0 0 6px;margin-bottom:8px;font-size:9pt}
    .cont span{font-size:7.5pt;color:#555;font-family:'Courier New',monospace}
    table{border-collapse:collapse;table-layout:fixed}
    .rel{width:calc(100% - 12px)}
    .rel tr.cj td:first-child{box-shadow:inset 3px 0 0 #2B4C7E}
    .rel th,.rel td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top;word-break:break-word}
    .rel thead th{background:#f3f4f6;font-weight:700;font-size:7pt;text-transform:uppercase;letter-spacing:.2px;padding:4px 5px}
    .rel .pl{font-family:'Courier New',monospace;font-weight:700;font-size:9pt;white-space:nowrap}
    .rel tr.gr td{background:#e8eef7;color:#2B4C7E;font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.3px;padding:3px 5px;border-color:#c7d3e6}
    .rel tr.db td{border-top:0;padding:1px 4px 3px;background:#fbfcfe}
    .mini{width:100%;table-layout:fixed}
    .mini th{background:none;border:0;font-size:6.5pt;font-weight:400;color:#6b7280;text-align:right;padding:0 4px}
    .mini td{border:0;text-align:right;padding:0 4px;font-size:8pt;font-family:'Courier New',monospace}
    .al,.st-v{color:#b91c1c;font-weight:600}.lv,.st-e{color:#15803d;font-weight:600}
    .st-a{color:#b45309;font-weight:600}.st-n{color:#6b7280}
    .totbox{margin-right:12px;border:1px solid #9ca3af;margin-top:10px;padding:4px 0 5px;break-inside:avoid}
    .tot-h{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.2px;padding:0 6px 2px;color:#111}
    .totbox .mini td{font-size:9pt;font-weight:700}
    .tot-g{text-align:right;padding:3px 6px 0;margin-top:3px;border-top:1px solid #e5e7eb;font-size:9.5pt;font-weight:700}
    .pg{text-align:center;font-size:7pt;color:#6b7280;margin-top:6px;padding-right:12px;position:relative;clear:both}
  </style></head><body>${paginas.map(pagina).join("")}</body></html>`;
  return html;
}

export async function exportFleetRelacaoPdf(linhas: RelacaoLinha[], anos: number[], op: RelacaoOpcoes = OPCOES_PADRAO) {
  const company = await fetchMatrizHeader();
  const html = montarHtmlRelacao(linhas, anos, op, company);
  await downloadHtmlAsPdf(html, `Relacao documentos e multas ${new Date().toISOString().slice(0, 10)}.pdf`, { orientation: "portrait", marginMm: MARGIN_MM });
}
