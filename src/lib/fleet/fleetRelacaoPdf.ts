// PDF da relação de veículos selecionados em Documentos e Multas (A4 paisagem).
// A largura grande comporta todas as colunas (placa, veículo, RENAVAM, chassi, alienação, situação
// e os valores por ano), por isso o papel é paisagem.
// As linhas são empacotadas em páginas (.doc-page) para nenhum veículo ser cortado na quebra.
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { buildPrintHeaderHtml, fetchMatrizHeader } from "@/lib/printHeader";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { formatCurrency } from "@/lib/masks";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface RelacaoLinha {
  plate: string; veiculo: string; renavam: string; chassi: string; alienacao: string; situacao: string;
  /** Ano de fabricação/modelo do veículo. */
  ano?: string;
  /** UF onde o veículo está registrado. */
  uf?: string;
  porAno: Record<number, number>; multas: number; total: number;
  /** IPVA somado dos anos anteriores às colunas por ano (coluna "IPVA ant."). */
  ipvaAnteriores?: number;
  /** Licenciamentos de todos os anos somados (separados das multas). */
  licenciamento?: number;
  /** Unidade de tração (cavalo) — separa os grupos do resumo. */
  cavalo?: boolean;
  /** Débitos em aberto por ano (todos os anos), usados no resumo. */
  ipvaPorAnoTodos?: Record<number, number>; licPorAno?: Record<number, number>; multasPorAno?: Record<number, number>;
  /** Rótulo do conjunto (placas vinculadas entre si); vazio quando avulso. */
  conjunto?: string;
  /** Título da faixa do grupo (ex.: "Cavalos"); sem ele a faixa mostra "Conjunto: …". */
  titulo?: string;
  /** Valor de mercado (Tabela FIPE ou preenchido à mão). */
  fipe?: number;
}

export type OrdemRelacao = "conjuntos" | "tipo";
/** Categoria da unidade → grupo da relação por tipo: cavalos, depois reboques/semirreboques, depois dollys. */
export function grupoTipo(categoria: string | null | undefined): 0 | 1 | 2 {
  const c = String(categoria || "").toLowerCase();
  if (c === "dolly") return 2;
  if (c === "reboque" || c === "semirreboque") return 1;
  return 0;
}
const TITULOS_TIPO = ["Cavalos", "Reboques e semirreboques", "Dollys"];
export function agruparPorTipo(linhas: RelacaoLinha[], categoriaPorPlaca: Map<string, string>): RelacaoLinha[] {
  return linhas.map((l) => ({ l, g: grupoTipo(categoriaPorPlaca.get(l.plate)) }))
    .sort((a, b) => a.g - b.g || String(a.l.plate).localeCompare(String(b.l.plate)))
    .map(({ l, g }) => ({ ...l, conjunto: TITULOS_TIPO[g], titulo: TITULOS_TIPO[g] }));
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
    .sort((a, b) => (b.length > 1 ? 1 : 0) - (a.length > 1 ? 1 : 0)
      || (tr.has(norm(b[0].plate)) ? 1 : 0) - (tr.has(norm(a[0].plate)) ? 1 : 0)
      || String(a[0].plate).localeCompare(String(b[0].plate)))
    .flatMap((g) => {
      const rot = g.length > 1 ? g.map((l) => l.plate).join(" + ") : "";
      return g.map((l) => ({ ...l, conjunto: rot }));
    });
}
export interface RelacaoOpcoes { veiculo: boolean; ano: boolean; uf: boolean; renavam: boolean; chassi: boolean; alienacao: boolean; situacao: boolean; debitos: boolean; resumo?: boolean; fipe: boolean }
export const OPCOES_PADRAO: RelacaoOpcoes = { veiculo: true, ano: true, uf: true, renavam: true, chassi: true, alienacao: true, situacao: true, debitos: true, resumo: false, fipe: true };

// ---------- Geometria da página (A4 paisagem: 297 x 210 mm) ----------
export const MARGIN_MM = 12;
const PAGE_W_MM = 297, PAGE_H_MM = 210;
const BODY_W_PX = 1030; // 1030px ≈ 272,5mm, dentro da área útil de 273mm (297 - 2 x 12)
// Folga de 24px: as linhas com texto quebrado (alienação longa) ficam um pouco mais altas
// que a estimativa, e sem essa margem a página estourava e gerava uma folha em branco.
const USABLE_H_PX = Math.floor(((PAGE_H_MM - MARGIN_MM * 2) / 25.4) * 96) - 24; // ≈ 678px

// Alturas estimadas (px) usadas para empacotar as linhas.
// Valores medidos no HTML real em paisagem: cabeçalho 66, barra de continuação 30, rodapé+paginação+marca 63,
// cabeçalho da tabela 23, linha de totais do rodapé 24, linha do veículo 21 (+10 por linha extra de texto).
// Cada constante leva uma folga pequena. H_DEB ficou do modelo antigo (linha de débitos separada).
export const H_HEADER = 70, H_CONT = 34, H_FOOTER = 66, H_THEAD = 24, H_TOT = 26;
export const H_ID = 24, H_LINHA_EXTRA = 13, H_DEB = 32;

export interface PaginaRelacao { linhas: RelacaoLinha[]; altura: number }

/** Largura útil de texto numa coluna: % da tabela (12px mais estreita que a página) menos o padding da célula. */
const utilPx = (pct: number) => (BODY_W_PX - 12) * (pct / 100) - 10;

interface Col { key: keyof RelacaoOpcoes; label: string; width: string; px: number; get: (l: RelacaoLinha) => string; /** Texto curto que nunca pode quebrar (ano, UF, RENAVAM). */ nw?: boolean }
// Larguras pensadas para o modelo "igual à tela": as colunas de valores (IPVA por ano,
// licenciamento, multas, total e valor de mercado) ocupam a sobra à direita, então as de
// texto ficam estreitas e o texto longo quebra dentro da própria célula.
// A soma abaixo deixa ~50% para as colunas de valores (ver PLACA_PCT e numPct em montarHtmlRelacao).
export const PLACA_PCT = 5.5;
const COLS: Col[] = [
  { key: "veiculo", label: "Veículo", width: "9%", px: utilPx(9), get: (l) => l.veiculo },
  { key: "ano", label: "Ano", width: "3.8%", px: utilPx(3.8), get: (l) => l.ano, nw: true },
  { key: "uf", label: "UF", width: "3%", px: utilPx(3), get: (l) => l.uf, nw: true },
  { key: "renavam", label: "RENAVAM", width: "7.8%", px: utilPx(7.8), get: (l) => l.renavam, nw: true },
  { key: "chassi", label: "Chassi", width: "7%", px: utilPx(7), get: (l) => l.chassi },
  { key: "alienacao", label: "Alienação", width: "7.5%", px: utilPx(7.5), get: (l) => l.alienacao },
  { key: "situacao", label: "Situação", width: "6.5%", px: utilPx(6.5), get: (l) => l.situacao },
];
/** Soma das larguras das colunas de texto realmente exibidas (usado para calcular a sobra dos valores). */
export const textoPct = (cols: Col[]) => cols.reduce((t, c) => t + parseFloat(c.width), 0);
const SITUACAO_CLASSE: Record<string, string> = { "Vencido": "st-v", "A vencer": "st-a", "Em dia": "st-e", "Sem registro": "st-n" };
// Tom de fundo da linha conforme a situação, como na tabela da tela (rowToneClass).
const TOM_LINHA: Record<string, string> = { "Vencido": "ton-v", "A vencer": "ton-a", "Em dia": "ton-e" };

/** Um veículo só ganha a linha de débitos quando tem algo em aberto. */
export function temDebitos(l: RelacaoLinha, op: RelacaoOpcoes): boolean {
  if (!op.debitos) return false;
  return l.total > 0 || l.multas > 0 || (l.licenciamento || 0) > 0 || (l.ipvaAnteriores || 0) > 0 || Object.values(l.porAno || {}).some((v) => v > 0);
}

/** A relação fecha com a linha de totais quando há débitos ou a coluna de valor de mercado. */
export function temTotais(linhas: RelacaoLinha[], op: RelacaoOpcoes): boolean {
  return !!op.fipe || linhas.some((l) => temDebitos(l, op));
}

// ---------- Medida de texto (prevê quantas linhas uma célula ocupa) ----------
let _ctx: CanvasRenderingContext2D | null | undefined;
const ctx2d = () => {
  if (_ctx === undefined) {
    // jsdom (ambiente de teste) não tem canvas: usa a estimativa por caractere.
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "")) _ctx = null;
    else try {
      const c = document.createElement("canvas");
      _ctx = c.getContext("2d");
      if (_ctx) _ctx.font = "10.667px Arial"; // 8pt, a fonte da tabela
    } catch { _ctx = null; }
  }
  return _ctx;
};
const _larguras = new Map<string, number>();
const larguraTexto = (t: string): number => {
  const s = (t || "").trim();
  if (!s) return 0;
  const hit = _larguras.get(s);
  if (hit !== undefined) return hit;
  const c = ctx2d();
  // Sem canvas (ambiente de teste): 6,6px por caractere, o medido em textos de marca/modelo e alienação.
  const w = c ? c.measureText(s).width : s.length * 6.6;
  _larguras.set(s, w);
  return w;
};

/** Linhas que o texto ocupa na coluna de `px` úteis. */
const linhasDeTexto = (t: string, px: number) => Math.max(1, Math.ceil(larguraTexto(t) / Math.max(1, px)));

const alturaLinha = (l: RelacaoLinha, op: RelacaoOpcoes): number => {
  // A linha cresce conforme a coluna de texto que precisar de mais linhas (marca/modelo,
  // chassi, alienação, situação…), senão a página estoura quando uma coluna estreita quebra.
  let li = 1;
  for (const c of COLS) if (op[c.key]) li = Math.max(li, linhasDeTexto(c.get(l) || "—", c.px));
  // Uma linha por veículo (modelo da tela): sem a linha extra de débitos do modelo antigo.
  return H_ID + H_LINHA_EXTRA * (li - 1);
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
  let anteriorConj = false;
  for (const b of blocos) {
    const faixa = b[0].conjunto || anteriorConj ? H_GRUPO : 0;
    anteriorConj = !!b[0].conjunto;
    const hs = b.map((l) => alturaLinha(l, op));
    const tot = hs.reduce((t, h) => t + h, 0) + faixa;
    if (cur.length && used + tot > cap(pages.length) && tot <= cap(pages.length + 1)) {
      pages.push({ linhas: cur, altura: used });
      cur = []; used = 0;
    }
    b.forEach((l, i) => {
      const h = hs[i] + (i === 0 ? faixa : 0);
      if (cur.length && used + h > cap(pages.length)) { pages.push({ linhas: cur, altura: used }); cur = []; used = 0; }
      cur.push(l); used += h;
    });
  }
  if (cur.length) pages.push({ linhas: cur, altura: used });
  if (!pages.length) pages.push({ linhas: [], altura: 0 });

  // O bloco de totais fecha a relação: se não couber na última página, ganha a sua.
  if (temTotais(linhas, op)) {
    const last = pages[pages.length - 1];
    if (last.altura + H_TOT > cap(pages.length - 1)) pages.push({ linhas: [], altura: 0 });
  }
  return pages;
}

const rotulos = (anosDesc: number[]) => anosDesc.length ? [...anosDesc.map((a) => `IPVA ${a}`), "IPVA ant.", "Licenc.", "Multas", "Total"] : [];
const extras = (l: RelacaoLinha) => [l.ipvaAnteriores || 0, l.licenciamento || 0, l.multas, l.total];
const valores = (l: RelacaoLinha, anosDesc: number[], m: (v: number) => string) =>
  anosDesc.length ? [...anosDesc.map((a) => m(l.porAno?.[a] || 0)), ...extras(l).map(m)] : [];

/** Monta o HTML completo (uma div .doc-page por página). */
export function montarHtmlRelacao(linhas: RelacaoLinha[], anos: number[], op: RelacaoOpcoes, company: { name: string; docLine: string; address: string }): string {
  const ordenadas = linhas.some((l) => l.conjunto) ? linhas : [...linhas].sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
  const anosDesc = op.debitos ? [...anos].sort((a, b) => b - a) : [];
  const cols = COLS.filter((c) => op[c.key]);
  const antesFipe = cols.filter((c) => ["veiculo", "ano", "uf"].includes(c.key));
  const depoisFipe = cols.filter((c) => !antesFipe.includes(c));
  const m = (v: number) => (v ? formatCurrency(v) : "—");
  // Nas células de valor não entra o símbolo "R$": ele aparece no rótulo de cada coluna, o que
  // libera largura para as colunas de números caberem no A4 paisagem sem encolher a fonte.
  const mc = (v: number) => (v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const colFipe = !!op.fipe;
  const rot = rotulos(anosDesc);
  // A largura que sobra das colunas de texto é dividida igual entre as colunas de valores
  // (IPVA por ano, IPVA ant., licenciamento, multas, total e valor de mercado).
  const nNum = rot.length + (colFipe ? 1 : 0);
  const numPct = nNum ? (100 - PLACA_PCT - textoPct(cols)) / nNum : 0;
  const numStyle = `style="width:${numPct.toFixed(2)}%"`;
  const nCols = 1 + cols.length + rot.length + (colFipe ? 1 : 0);
  const paginas = montarPaginas(ordenadas, op);
  const temConjuntos = ordenadas.some((l) => l.conjunto);
  const comTotais = temTotais(ordenadas, op);
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

  const cabecalhoTexto = (cs: Col[]) => cs.map((c) => `<th${c.nw ? ' class="nw"' : ""} style="width:${c.width}">${c.label}</th>`).join("");
  const head = `<th class="pl" style="width:${PLACA_PCT}%">Placa</th>${cabecalhoTexto(antesFipe)}${colFipe ? `<th class="num" ${numStyle}>Valor FIPE (R$)</th>` : ""}${cabecalhoTexto(depoisFipe)}${rot.map((r) => `<th class="num" ${numStyle}>${r} (R$)</th>`).join("")}`;
  // FIPE acompanha a identificação, logo após UF; débitos permanecem à direita.
  const rowId = (l: RelacaoLinha) => {
    const tom = TOM_LINHA[(l.situacao || "").trim()] || "";
    const cls = [l.conjunto ? "cj" : "", tom].filter(Boolean).join(" ");
    const celulasTexto = (cs: Col[]) => cs.map((c) => `<td${c.nw ? ' class="nw"' : ""}>${celula(c, c.get(l))}</td>`).join("");
    return `<tr${cls ? ` class="${cls}"` : ""}><td class="pl">${esc(l.plate)}</td>${celulasTexto(antesFipe)}${colFipe ? `<td class="num">${mc(l.fipe || 0)}</td>` : ""}${celulasTexto(depoisFipe)}${valores(l, anosDesc, mc).map((v) => `<td class="num">${v}</td>`).join("")}</tr>`;
  };

  // Mantém a soma FIPE no mesmo trilho da coluna, antes dos demais totais.
  const identificacaoTotais = colFipe
    ? `<td colspan="${1 + antesFipe.length}" class="tot-l">Totais · ${ordenadas.length} veículo(s)</td><td class="num">${mc(soma((l) => l.fipe || 0))}</td>${depoisFipe.length ? `<td colspan="${depoisFipe.length}"></td>` : ""}`
    : `<td colspan="${1 + cols.length}" class="tot-l">Totais · ${ordenadas.length} veículo(s)</td>`;
  const totais = comTotais ? `<tfoot><tr>${identificacaoTotais}${rot.map((_, i) => `<td class="num">${i < anosDesc.length
      ? mc(soma((l) => l.porAno?.[anosDesc[i]] || 0))
      : mc(soma((l) => extras(l)[i - anosDesc.length]))}</td>`).join("")}</tr></tfoot>` : "";

  const corpo = (p: PaginaRelacao, ultima: boolean) => p.linhas.length
    ? `<table class="rel"><thead><tr>${head}</tr></thead><tbody>${p.linhas.map((l, i) => (l.conjunto && (i === 0 || p.linhas[i - 1].conjunto !== l.conjunto) ? `<tr class="gr"><td colspan="${nCols}">${esc(l.titulo || `Conjunto: ${l.conjunto}`)}</td></tr>` : "")
      + (!l.conjunto && temConjuntos && (i === 0 || p.linhas[i - 1].conjunto) ? `<tr class="gr av"><td colspan="${nCols}">Veículos sem conjunto no filtro aplicado<span class="av-nota"> (podem ter vínculo fora desta seleção)</span></td></tr>` : "") + rowId(l)).join("")}</tbody>${ultima ? totais : ""}</table>`
    : (ultima && comTotais ? `<table class="rel"><thead><tr>${head}</tr></thead>${totais}</table>` : "");

  // Resumo (opcional): página inicial com totais por ano de IPVA, licenciamento e multas, para cavalos e demais.
  // Os anos que têm coluna própria (os dois mais recentes) saem um a um; de 2024 para trás somam em "Anos anteriores".
  const resumoTabela = (titulo: string, ls: RelacaoLinha[]) => {
    const anosR = new Set<number>();
    const add = (o?: Record<number, number>) => Object.entries(o || {}).forEach(([a, v]) => { if (v) anosR.add(Number(a)); });
    ls.forEach((l) => { add(l.ipvaPorAnoTodos); add(l.licPorAno); add(l.multasPorAno); });
    const f = (a: number, k: "ipvaPorAnoTodos" | "licPorAno" | "multasPorAno") => ls.reduce((t, l) => t + (l[k]?.[a] || 0), 0);
    // Uma linha do resumo: rótulo + soma dos anos pedidos em cada categoria.
    const linha = (rotulo: string, anosU: number[]) => {
      const i = anosU.reduce((t, a) => t + f(a, "ipvaPorAnoTodos"), 0);
      const li = anosU.reduce((t, a) => t + f(a, "licPorAno"), 0);
      const mu = anosU.reduce((t, a) => t + f(a, "multasPorAno"), 0);
      return [rotulo, i, li, mu, i + li + mu] as const;
    };
    const comCorte = anosDesc.length > 0;
    const todos = [...anosR].sort((a, b) => b - a);
    const recentes = comCorte ? todos.filter((a) => anosDesc.includes(a)) : todos;
    const antigos = comCorte ? todos.filter((a) => !anosDesc.includes(a)) : [];
    const linhasR = recentes.map((a) => linha(String(a), [a]));
    if (antigos.length) linhasR.push(linha("Anos anteriores", antigos));
    const tot = [1, 2, 3, 4].map((k) => linhasR.reduce((t, r) => t + (r[k] as number), 0));
    return `<div class="rs-t">${esc(titulo)} · ${ls.length} veículo(s)</div><table class="rel rs"><thead><tr><th>Ano</th><th class="num">IPVA</th><th class="num">Licenciamento</th><th class="num">Multas</th><th class="num">Total</th></tr></thead><tbody>${linhasR.length ? linhasR.map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((v) => `<td class="num">${m(v as number)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="5">Nenhum débito em aberto.</td></tr>`}</tbody><tfoot><tr><td class="tot-l">Total</td>${tot.map((v) => `<td class="num">${m(v)}</td>`).join("")}</tr></tfoot></table>`;
  };
  const comResumo = !!op.resumo;
  const totalPags = paginas.length + (comResumo ? 1 : 0);
  const paginaResumo = comResumo ? `<div class="doc-page">
    <div class="hdr">${buildPrintHeaderHtml({ company, title: "Relação de documentos e multas — Resumo", subtitle: `${ordenadas.length} veículo(s) · ${quando}` })}</div>
    ${resumoTabela("Cavalos", ordenadas.filter((l) => l.cavalo))}
    ${resumoTabela("Demais veículos (reboques, semirreboques e dollys)", ordenadas.filter((l) => !l.cavalo))}
    <div class="pg">Página 1 de ${totalPags}</div>
    ${printBrandFooterHtml()}
  </div>` : "";

  const pagina = (p: PaginaRelacao, i: number) => `<div class="doc-page">
    ${i === 0 && !comResumo
      ? `<div class="hdr">${buildPrintHeaderHtml({ company, title: "Relação de documentos e multas", subtitle: `${ordenadas.length} veículo(s) · ${quando}` })}</div>`
      : `<div class="cont"><b>Relação de documentos e multas</b><span>${ordenadas.length} veículo(s) · ${quando}</span></div>`}
    ${corpo(p, i === paginas.length - 1)}
    <div class="pg">Página ${i + 1 + (comResumo ? 1 : 0)} de ${totalPags}</div>
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
    .rel th,.rel td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top;word-break:normal;overflow-wrap:break-word}
    .rel .nw{white-space:nowrap}
    .rel thead th{background:#f3f4f6;font-weight:700;font-size:7pt;text-transform:uppercase;letter-spacing:.2px;padding:4px 5px}
    .rel thead th.num{text-align:right;font-size:6pt;white-space:nowrap;padding:4px 2px}
    .rel .pl{font-family:'Courier New',monospace;font-weight:700;font-size:8pt;white-space:nowrap}
    .rel td.num{text-align:right;font-family:'Courier New',monospace;font-size:7pt;white-space:nowrap;vertical-align:middle;padding:3px 2px}
    .rel tr.gr td{background:#e8eef7;color:#2B4C7E;font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.3px;padding:3px 5px;border-color:#c7d3e6}
    .rel tr.gr.av td{background:#f3f4f6;color:#374151;border-color:#d1d5db}
    .rel tr.gr.av .av-nota{font-weight:400;text-transform:none;letter-spacing:0;font-size:7pt;color:#6b7280}
    .rel tr.ton-v td{background:#fef2f2}
    .rel tr.ton-a td{background:#fffbeb}
    .rel tr.ton-e td{background:#f0fdf4}
    .rel tfoot td{background:#f3f4f6;font-weight:700;border:1px solid #d1d5db;padding:4px 5px;font-size:8pt}
    .rel tfoot td.num{font-family:'Courier New',monospace;font-size:6.4pt;padding:4px 2px}
    .rel tfoot .tot-l{text-transform:uppercase;font-size:7pt;letter-spacing:.2px}
    .al,.st-v{color:#b91c1c;font-weight:600}.lv,.st-e{color:#15803d;font-weight:600}
    .st-a{color:#b45309;font-weight:600}.st-n{color:#6b7280}
    .pg{text-align:center;font-size:7pt;color:#6b7280;margin-top:6px;padding-right:12px;position:relative;clear:both}
    .rs-t{font-weight:700;font-size:9pt;margin:10px 0 4px;color:#2B4C7E}.rs{width:60%}
  </style></head><body>${paginaResumo}${paginas.map(pagina).join("")}</body></html>`;
  return html;
}

export async function exportFleetRelacaoPdf(linhas: RelacaoLinha[], anos: number[], op: RelacaoOpcoes = OPCOES_PADRAO) {
  const company = await fetchMatrizHeader();
  const html = montarHtmlRelacao(linhas, anos, op, company);
  await downloadHtmlAsPdf(html, `Relacao documentos e multas ${new Date().toISOString().slice(0, 10)}.pdf`, { orientation: "landscape", marginMm: MARGIN_MM });
}
