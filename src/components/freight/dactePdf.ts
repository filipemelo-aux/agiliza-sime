// DACTE desenhado em vetor (jsPDF) com as coordenadas exatas do modelo oficial (pt, A4 595.28 x 841.89).
// Não depende do layout do navegador: linhas, textos, código de barras e QR Code saem sempre na mesma posição.
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, maskCEP, formatCurrency } from "@/lib/masks";
import type { CtePrintInput } from "./ctePrint";

type Dict = Record<string, any>;
type Quantity = { cUnid?: string; tpMed?: string; qCarga?: number };
type Component = { xNome?: string; nome?: string; vComp?: number; valor?: number };
type NfeDetail = { chave?: string; numero?: string; serie?: string };
type ActorPrefix = "remetente" | "destinatario" | "expedidor" | "recebedor" | "tomador";
type Actor = { nome: string; endereco: string; municipio: string; uf: string; cep: string; doc: string; ie: string; fone: string };

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const up = (v: unknown) => String(v ?? "").toLocaleUpperCase("pt-BR");
const money = (v: unknown) => formatCurrency(Number(v || 0)).replace(/^R\$\s?/, "");
const num = (v: unknown, places: number) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: places, maximumFractionDigits: places });

const docMask = (v?: string | null) => {
  const d = digits(v);
  if (d.length === 14) return maskCNPJ(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "";
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const dateTimeBR = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value || "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
};

const TP_CTE: Record<number, string> = { 0: "Normal", 1: "Complementar", 2: "Anulação", 3: "Substituto" };
const TP_SERV: Record<number, string> = { 0: "Normal", 1: "Subcontratação", 2: "Redespacho", 3: "Redespacho intermediário", 4: "Multimodal" };
const CST_ICMS: Record<string, string> = {
  "00": "Tributação normal do ICMS",
  "20": "Tributação com redução de BC do ICMS",
  "40": "ICMS isenção",
  "41": "ICMS não tributado",
  "51": "ICMS diferido",
  "60": "ICMS cobrado por substituição tributária",
  "90": "ICMS outros",
};
const UNIT: Record<string, string> = { "00": "M3", "01": "KG", "02": "TON", "03": "UNIDADE", "04": "LITROS", "05": "MMBTU" };

// Linhas divisórias do modelo (x1, y1, x2, y2) em pt.
const H_LINES: [number, number, number][] = [
  [27, 568, 25], [233, 484, 48], [233, 484, 72], [27, 233, 108], [27, 568, 127], [27, 568, 149], [27, 568, 171],
  [27, 568, 190], [27, 568, 252], [27, 568, 312], [27, 568, 347], [27, 568, 367], [27, 568, 385], [27, 568, 392],
  [442, 568, 410], [27, 568, 428], [27, 568, 435], [27, 568, 457], [27, 568, 464], [27, 568, 572], [27, 568, 579],
  [27, 568, 651], [27, 568, 747], [27, 568, 766], [27, 206, 786], [27, 568, 807],
];
const V_LINES: [number, number, number][] = [
  [27, 25, 651], [568, 25, 651], [233, 25, 127], [405, 25, 72], [484, 25, 127], [272, 48, 72], [292, 48, 72], [358, 48, 72],
  [132, 108, 149], [310, 127, 171], [298, 171, 312], [232, 347, 367], [431, 347, 367],
  [49, 367, 385], [155, 367, 385], [267, 367, 385], [378, 367, 385], [476, 367, 385],
  [166, 392, 428], [304, 392, 428], [442, 392, 428],
  [286, 435, 457], [353, 435, 457], [383, 435, 457], [452, 435, 457], [495, 435, 457],
  [298, 464, 572], [27, 747, 807], [568, 747, 807], [206, 766, 807], [485, 747, 807],
];

class Painter {
  constructor(public pdf: jsPDF) {}

  font(size: number, bold = false) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
  }

  fit(text: string, size: number, maxW?: number, bold = false) {
    this.font(size, bold);
    if (!maxW || this.pdf.getTextWidth(text) <= maxW) return { text, size };
    let s = size;
    while (s > size * 0.62) {
      s -= 0.2;
      this.font(s, bold);
      if (this.pdf.getTextWidth(text) <= maxW) return { text, size: s };
    }
    let t = text;
    while (t.length > 1 && this.pdf.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
    return { text: `${t.trimEnd()}…`, size: s };
  }

  /** top = topo da caixa do texto (mesma referência medida no modelo). */
  text(value: unknown, x: number, top: number, size: number, opts: { bold?: boolean; align?: "left" | "center" | "right"; maxW?: number } = {}) {
    const raw = up(value);
    if (!raw.trim()) return;
    const { text, size: s } = this.fit(raw, size, opts.maxW, opts.bold);
    this.font(s, opts.bold);
    this.pdf.text(text, x, top + size * 0.793, { align: opts.align || "left" });
  }

  lines(value: unknown, x: number, top: number, size: number, maxW: number, step: number, maxLines: number) {
    const raw = up(value);
    if (!raw.trim()) return 0;
    this.font(size);
    const all = raw.split("\n").flatMap((line) => (line.trim() ? (this.pdf.splitTextToSize(line, maxW) as string[]) : [""]));
    const shown = all.slice(0, maxLines);
    shown.forEach((line, i) => this.pdf.text(line, x, top + i * step + size * 0.793));
    return shown.length;
  }
}

function drawGrid(pdf: jsPDF) {
  pdf.setDrawColor(0);
  pdf.setLineWidth(1);
  for (const [x1, x2, y] of H_LINES) pdf.line(x1, y + 0.5, x2 + 1, y + 0.5);
  for (const [x, y1, y2] of V_LINES) pdf.line(x + 0.5, y1, x + 0.5, y2 + 1);
  // Marcas laterais do código de barras.
  pdf.setFillColor(0, 0, 0);
  pdf.rect(233, 115, 12, 3, "F");
  pdf.rect(473, 115, 12, 3, "F");
  // Caixas SIM / NÃO.
  pdf.rect(76.5, 135.5, 14, 12, "S");
  pdf.rect(112.5, 135.5, 14, 12, "S");
  // Quadro do modal rodoviário.
  const rects: [number, number, number, number][] = [
    [27.5, 652, 568.5, 662], [27.5, 662, 568.5, 672], [27.5, 672, 383.5, 682], [383.5, 672, 568.5, 682],
    [27.5, 682, 383.5, 702], [383.5, 682, 568.5, 702],
  ];
  for (const [x0, y0, x1, y1] of rects) pdf.rect(x0, y0, x1 - x0, y1 - y0, "S");
  // Linha de corte do canhoto.
  pdf.setLineDashPattern([2, 2], 0);
  pdf.line(27, 744.5, 568, 744.5);
  pdf.setLineDashPattern([], 0);
}

function drawBarcode(pdf: jsPDF, key: string) {
  if (key.length !== 44) return;
  const target: Dict = {};
  JsBarcode(target as any, key, { format: "CODE128C" });
  const data: string = (target.encodings || []).map((e: Dict) => e.data).join("");
  if (!data) return;
  const x0 = 241, width = 236.8, top = 79, height = 26;
  const module = width / data.length;
  pdf.setFillColor(0, 0, 0);
  let i = 0;
  while (i < data.length) {
    if (data[i] === "1") {
      let j = i;
      while (j < data.length && data[j] === "1") j++;
      pdf.rect(x0 + i * module, top, (j - i) * module, height, "F");
      i = j;
    } else i++;
  }
}

function drawQr(pdf: jsPDF, url: string) {
  if (!url) return;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const box = 80, x0 = 486, y0 = 37;
  const cell = box / size;
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) pdf.rect(x0 + c * cell, y0 + r * cell, cell + 0.05, cell + 0.05, "F");
    }
  }
}

async function loadLogo(): Promise<{ data: string; w: number; h: number } | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}/logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

async function loadEmitente(id?: string | null) {
  if (!id) return null;
  const { data } = await supabase
    .from("fiscal_establishments")
    .select("razao_social, cnpj, inscricao_estadual, rntrc, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep, profile_id")
    .eq("id", id)
    .maybeSingle();
  const emit = (data as Dict) || null;
  if (emit?.profile_id) {
    const { data: prof } = await supabase.from("profiles").select("phone").eq("id", emit.profile_id).maybeSingle();
    emit.telefone = (prof as Dict | null)?.phone || "";
  }
  return emit;
}

async function loadProfilesByDoc(docs: string[]) {
  const clean = Array.from(new Set(docs.map(digits).filter((d) => d.length === 11 || d.length === 14)));
  const map = new Map<string, Dict>();
  if (!clean.length) return map;
  const variants = clean.flatMap((d) => [d, docMask(d)]);
  const { data } = await supabase
    .from("profiles")
    .select("cnpj, phone, address_city, address_state, address_zip, inscricao_estadual")
    .in("cnpj", variants);
  for (const row of (data as Dict[]) || []) {
    const key = digits(row.cnpj);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

const ibgeCache = new Map<string, string>();
async function municipioNome(code?: string | null) {
  const c = digits(code);
  if (c.length !== 7) return "";
  if (ibgeCache.has(c)) return ibgeCache.get(c)!;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${c}`, { signal: ctrl.signal });
    window.clearTimeout(timer);
    const json = res.ok ? await res.json() : null;
    const name = String(json?.nome || "");
    ibgeCache.set(c, name);
    return name;
  } catch {
    return "";
  }
}

function authorization(cte: CtePrintInput) {
  let protocol = String(cte.protocolo_autorizacao || "");
  let key = digits(cte.chave_acesso);
  let ambiente = "";
  let receivedAt = "";
  if (protocol.trim().startsWith("{")) {
    try {
      const p = JSON.parse(protocol) as Dict;
      protocol = String(p.protocolo || "");
      if (!key) key = digits(p.chave);
      ambiente = String(p.ambiente || "");
      receivedAt = String(p.data_recebimento || "");
    } catch {
      // texto simples gravado por integrações antigas
    }
  }
  return { key, protocol, ambiente, receivedAt };
}

async function resolveActors(cte: CtePrintInput) {
  const prefixes: ActorPrefix[] = ["remetente", "destinatario", "expedidor", "recebedor", "tomador"];
  const profiles = await loadProfilesByDoc(prefixes.map((p) => cte[`${p}_cnpj`]));
  const result = {} as Record<ActorPrefix, Actor>;
  await Promise.all(prefixes.map(async (p) => {
    const docDigits = digits(cte[`${p}_cnpj`]);
    const prof = profiles.get(docDigits) || {};
    const hasActor = Boolean(cte[`${p}_nome`] || docDigits);
    const municipio = hasActor
      ? cte[`${p}_municipio_nome`] || (await municipioNome(cte[`${p}_municipio_ibge`])) || prof.address_city || ""
      : "";
    result[p] = {
      nome: cte[`${p}_nome`] || "",
      endereco: cte[`${p}_endereco`] || "",
      municipio,
      uf: hasActor ? cte[`${p}_uf`] || prof.address_state || "" : "",
      cep: hasActor ? (cte[`${p}_cep`] || prof.address_zip ? maskCEP(digits(cte[`${p}_cep`] || prof.address_zip)) : "") : "",
      doc: docMask(cte[`${p}_cnpj`]),
      ie: cte[`${p}_ie`] || prof.inscricao_estadual || "",
      fone: hasActor ? cte[`${p}_telefone`] || prof.phone || "" : "",
    };
  }));
  return result;
}

async function driverDocument(id?: string | null) {
  if (!id) return "";
  const { data } = await supabase.from("profiles").select("cnpj").eq("id", id).maybeSingle();
  return digits((data as Dict | null)?.cnpj);
}

async function drawPage(pdf: jsPDF, cte: CtePrintInput, logo: Awaited<ReturnType<typeof loadLogo>>) {
  const P = new Painter(pdf);
  const [emit, actors, driverDoc] = await Promise.all([
    loadEmitente(cte.establishment_id),
    resolveActors(cte),
    driverDocument(cte.motorista_id),
  ]);
  const isService = cte.tipo_talao === "servico";
  const auth = authorization(cte);
  const authorized = !isService && cte.status === "autorizado" && Boolean(auth.key && auth.protocol);
  const number = cte.numero ?? cte.numero_interno ?? "";

  // Marca d'água para documentos sem valor fiscal.
  if (!authorized) {
    const mark = isService ? "DOCUMENTO INTERNO - SEM VALOR FISCAL" : cte.status === "cancelado" ? "CANCELADO" : "SEM VALOR FISCAL";
    pdf.setTextColor(215);
    P.font(isService ? 30 : 46, true);
    pdf.text(mark, 297.6, 470, { align: "center", angle: 35 });
    pdf.setTextColor(0);
  } else if (cte.status === "cancelado") {
    pdf.setTextColor(215);
    P.font(60, true);
    pdf.text("CANCELADO", 297.6, 470, { align: "center", angle: 35 });
    pdf.setTextColor(0);
  }

  drawGrid(pdf);

  // ---------- Cabeçalho do emitente ----------
  if (logo) {
    const boxH = 43, boxW = 60;
    const scale = Math.min(boxW / logo.w, boxH / logo.h);
    const w = logo.w * scale, h = logo.h * scale;
    pdf.addImage(logo.data, "PNG", 133.4 - w / 2, 28 + (boxH - h) / 2, w, h);
  }
  P.text(emit?.razao_social || "Sime Transporte Ltda", 133.4, 73, 7, { bold: true, align: "center", maxW: 200 });
  const address = [
    [emit?.endereco_logradouro, emit?.endereco_numero].filter(Boolean).join(", "),
    emit?.endereco_bairro ? `BAIRRO ${emit.endereco_bairro}` : "",
    [emit?.endereco_municipio, emit?.endereco_uf].filter(Boolean).join(" - "),
    emit?.endereco_cep ? `CEP ${maskCEP(digits(emit.endereco_cep))}` : "",
  ].filter(Boolean).join(" - ") + (emit?.telefone ? ` FONE: ${digits(emit.telefone)}` : "");
  P.font(5);
  const addrLines = (pdf.splitTextToSize(up(address), 196) as string[]).slice(0, 2);
  addrLines.forEach((line, i) => P.text(line, 133.4, 87 + i * 5, 5, { align: "center" }));
  P.text(`CNPJ: ${emit?.cnpj ? maskCNPJ(digits(emit.cnpj)) : ""} IE: ${emit?.inscricao_estadual || ""}`, 133.4, 87 + addrLines.length * 5, 5, { align: "center" });

  // ---------- Título / modal / metadados ----------
  P.text("DACTE", 319.5, 28, 8, { bold: true, align: "center" });
  if (isService) {
    P.text("Documento Auxiliar de CT-e", 319.5, 36, 6, { align: "center" });
    P.text("de Serviço (Uso interno)", 319.5, 42, 6, { align: "center" });
  } else {
    P.text("Documento Auxiliar do Conhecimento", 319.5, 36, 6, { align: "center" });
    P.text("de Transporte Eletrônico", 319.5, 42, 6, { align: "center" });
  }
  P.text("MODAL", 448, 30, 5, { align: "center" });
  P.text("Rodoviário", 448, 38, 7, { align: "center" });
  const meta: [string, unknown, number, boolean][] = [
    ["MODELO", isService ? "-" : "57", 253, false],
    ["SÉRIE", cte.serie ?? "", 282.5, false],
    ["NÚMERO", number, 325.5, true],
    ["PÁGINA", "1/1", 382, false],
    ["DATA E HORA DE EMISSÃO", dateTimeBR(cte.data_emissao), 444.5, false],
  ];
  for (const [label, value, cx, bold] of meta) {
    P.text(label, cx, 53, 5, { align: "center" });
    P.text(value, cx, bold ? 61.1 : 61, bold ? 8 : 7, { bold, align: "center", maxW: 76 });
  }

  // ---------- Código de barras / chave / QR ----------
  drawBarcode(pdf, auth.key);
  P.text("Chave de acesso para consulta de autenticidade no site www.cte.fazenda.gov.br", 361.5, 112, 5, { align: "center", maxW: 205 });
  P.text(auth.key, 361.5, 120, 7, { align: "center", maxW: 236 });
  if (auth.key.length === 44) {
    const tpAmb = auth.ambiente === "2" ? 2 : 1;
    drawQr(pdf, `https://dfe-portal.svrs.rs.gov.br/cte/qrCode?chCTe=${auth.key}&tpAmb=${tpAmb}`);
  } else {
    P.text(isService ? "INTERNO" : up(cte.status || "RASCUNHO"), 526, 74, 8, { bold: true, align: "center", maxW: 78 });
  }

  // ---------- Tipo do CT-e / serviço ----------
  P.text("TIPO DO CT-E", 29.8, 114, 5);
  P.text(TP_CTE[Number(cte.tp_cte)] || "Normal", 70.8, 113, 6, { maxW: 58 });
  P.text("TIPO DO SERVIÇO", 135.8, 114, 5);
  P.text(TP_SERV[Number(cte.tp_serv)] || "Normal", 183.5, 113, 6, { maxW: 48 });

  // ---------- Globalizado / protocolo ----------
  P.text("INDICADOR DO CT-E GLOBALIZADO", 29.8, 130, 5);
  P.text("SIM", 62.8, 140, 5);
  P.text("NÃO", 97.8, 140, 5);
  P.text("X", cte.globalizado ? 80.8 : 116.8, 136.1, 12, { bold: true });
  P.text("INFORMAÇÕES DO CT-E GLOBALIZADO", 135.8, 130, 5);
  P.text(cte.informacoes_cte_globalizado, 135.8, 138, 6, { maxW: 170 });
  P.text("Nº PROTOCOLO", 312.8, 129, 5);
  if (auth.protocol) P.text(`${auth.protocol} ${dateTimeBR(auth.receivedAt || cte.data_autorizacao)}`, 312.8, 137, 7, { maxW: 252 });

  // ---------- CFOP / SUFRAMA ----------
  P.text("CFOP - NATUREZA DA PRESTAÇÃO", 29.8, 153, 5);
  P.text(`${cte.cfop || ""} - ${cte.natureza_operacao || ""}`, 29.8, 161, 7, { maxW: 277 });
  P.text("INSC. SUFRAMA DO DESTINATÁRIO", 312.8, 152, 5);
  P.text(cte.destinatario_suframa, 312.8, 160, 7, { maxW: 252 });

  // ---------- Origem / destino ----------
  const originName = cte.municipio_origem_nome || (await municipioNome(cte.municipio_origem_ibge));
  const destName = cte.municipio_destino_nome || (await municipioNome(cte.municipio_destino_ibge));
  const routeLabel = (name: string, uf?: string | null, ibge?: string | null) =>
    [name, uf].filter(Boolean).join(" - ") + (digits(ibge) ? ` (${digits(ibge)})` : "");
  P.text("ORIGEM DA PRESTAÇÃO", 29.8, 174, 5);
  P.text(routeLabel(originName, cte.uf_origem, cte.municipio_origem_ibge), 29.8, 182, 7, { maxW: 265 });
  P.text("DESTINO DA PRESTAÇÃO", 300.8, 174, 5);
  P.text(routeLabel(destName, cte.uf_destino, cte.municipio_destino_ibge), 300.8, 182, 7, { maxW: 264 });

  // ---------- Remetente / destinatário / expedidor / recebedor ----------
  const actorBlock = (a: Actor, title: string, left: number, top: number, valueOffset: number) => {
    const lx = left + 2.8, vx = left + valueOffset, cx = left + 216.8;
    P.text(title, lx, top + 5, 5);
    P.text(a.nome, vx, top + 4, 6, { maxW: 268 - valueOffset });
    P.text("ENDEREÇO", lx, top + 14, 5);
    P.font(6);
    const addr = (pdf.splitTextToSize(up(a.endereco), 268 - valueOffset) as string[]).slice(0, 2);
    addr.forEach((line, i) => P.text(line, vx, top + 13 + i * 8, 6));
    P.text("MUNICÍPIO", lx, top + 32, 5);
    P.text([a.municipio, a.uf].filter(Boolean).join(" - "), vx, top + 31, 6, { maxW: 196 - valueOffset });
    P.text("CEP", left + 200.8, top + 32, 5);
    P.text(a.cep, cx, top + 31, 6, { maxW: 52 });
    P.text("CNPJ/CPF", lx, top + 42, 5);
    P.text(a.doc, vx, top + 41, 6, { maxW: 110 });
    P.text("INSCRIÇÃO ESTADUAL", left + 154.8, top + 42, 5);
    P.text(a.ie, cx, top + 41, 6, { maxW: 52 });
    P.text("PAIS", lx, top + 52, 5);
    if (a.nome || a.doc) P.text("BRASIL", vx, top + 51, 6);
    P.text("FONE", left + 196.8, top + 52, 5);
    P.text(a.fone, cx, top + 51, 6, { maxW: 52 });
  };
  actorBlock(actors.remetente, "REMETENTE", 27, 190, 41.8);
  actorBlock(actors.destinatario, "DESTINATÁRIO", 299, 190, 44.8);
  actorBlock(actors.expedidor, "EXPEDIDOR", 27, 250, 41.8);
  actorBlock(actors.recebedor, "RECEBEDOR", 299, 250, 44.8);

  // ---------- Tomador ----------
  const t = actors.tomador;
  P.text("TOMADOR DO SERVIÇO", 29.8, 317, 5);
  P.text(t.nome, 93.8, 316, 6, { maxW: 200 });
  P.text("MUNICÍPIO", 298.8, 317, 5);
  P.text(t.municipio, 330.8, 316, 6, { maxW: 156 });
  P.text("UF", 490.8, 317, 5);
  P.text(t.uf, 502.8, 316, 6);
  P.text("CEP", 517.8, 317, 5);
  P.text(t.cep, 532.8, 316, 6, { maxW: 34 });
  P.text("ENDEREÇO", 29.8, 327, 5);
  P.text(t.endereco, 63.8, 326, 6, { maxW: 372 });
  P.text("PAÍS", 439.8, 327, 5);
  if (t.nome || t.doc) P.text("BRASIL", 456.8, 326, 6);
  P.text("CNPJ/CPF", 29.8, 337, 5);
  P.text(t.doc, 63.8, 336, 6, { maxW: 122 });
  P.text("INSCRIÇÃO ESTADUAL", 189.8, 337, 5);
  P.text(t.ie, 247.8, 336, 6, { maxW: 50 });
  P.text("FONE", 299.8, 337, 5);
  P.text(t.fone, 318.8, 336, 6, { maxW: 110 });

  // ---------- Carga ----------
  P.text("PRODUTO PREDOMINANTE", 29.8, 350, 5);
  P.text(cte.produto_predominante, 29.8, 358, 7, { maxW: 200 });
  P.text("OUTRAS CARACTERÍSTICAS DA CARGA", 234.8, 350, 5);
  P.text(cte.caracteristicas_adicionais_carga, 234.8, 358, 7, { maxW: 194 });
  P.text("VALOR TOTAL DA MERCADORIA", 433.8, 350, 5);
  P.text(money(cte.valor_carga), 565.2, 358, 7, { align: "right" });

  const quantities = asArray<Quantity>(cte.info_quantidade).filter((q) => Number(q.qCarga || 0) > 0);
  if (!quantities.length && Number(cte.peso_bruto || 0) > 0) quantities.push({ cUnid: "01", tpMed: "PESO BRUTO", qCarga: Number(cte.peso_bruto) });
  P.text("QTD", 29.8, 370, 5);
  P.text("CARGA", 29.8, 380, 5);
  const qtyCells: [number, number][] = [[49, 155], [155, 267], [267, 378], [378, 476], [476, 568]];
  quantities.slice(0, qtyCells.length).forEach((q, i) => {
    const [l, r] = qtyCells[i];
    P.text(q.tpMed || "QUANTIDADE", l + 2.1, 370, 5, { maxW: r - l - 4 });
    P.text(`${num(q.qCarga, 4)} ${UNIT[String(q.cUnid || "01")] || ""}`, l + 5.8, 379, 6, { maxW: r - l - 8 });
  });

  // ---------- Componentes do valor ----------
  P.text("COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO", 298, 387, 5, { align: "center" });
  const comps = asArray<Component>(cte.componentes_frete).filter((c) => Number(c.vComp ?? c.valor ?? 0) !== 0);
  const list = comps.length ? comps : [{ xNome: "FRETE VALOR", vComp: Number(cte.valor_frete || 0) }];
  const compCols = [27, 166, 304];
  compCols.forEach((l) => {
    P.text("NOME", l + 2.8, 394, 5);
    P.text("VALOR", l + 72.8, 394, 5);
  });
  list.slice(0, 9).forEach((c, i) => {
    const l = compCols[i % 3];
    const row = Math.floor(i / 3);
    P.text(c.xNome || c.nome || "", l + 2.8, 402 + row * 8, 6, { maxW: 66 });
    P.text(money(c.vComp ?? c.valor), l + 137.2, 402 + row * 8, 7, { align: "right", maxW: 64 });
  });
  P.text("VALOR TOTAL DO SERVIÇO", 444.8, 394, 5);
  P.text(money(cte.valor_frete), 566.2, 402, 7, { align: "right" });
  P.text("VALOR A RECEBER", 444.8, 412, 5);
  P.text(money(cte.valor_receber ?? cte.valor_frete), 566.2, 420, 7, { align: "right" });

  // ---------- Impostos ----------
  P.text("INFORMAÇÕES RELATIVAS AO IMPOSTO", 298, 430, 5, { align: "center" });
  const cst = String(cte.cst_icms || "").padStart(2, "0");
  P.text("SITUAÇÃO TRIBUTÁRIA", 29.8, 438, 4);
  P.text(cte.cst_icms ? `${cst} - ${CST_ICMS[cst] || ""}` : "", 29.8, 446, 6, { maxW: 252 });
  P.text("BASE DE CÁLCULO", 288.8, 438, 5);
  P.text(money(cte.base_calculo_icms), 351.2, 446, 7, { align: "right" });
  P.text("ALÍQ ICMS", 355.8, 438, 5);
  P.text(num(cte.aliquota_icms, 2), 375.3, 446, 7, { align: "right" });
  P.text("VALOR ICMS", 385.8, 438, 5);
  P.text(money(cte.valor_icms), 450.2, 446, 7, { align: "right" });
  P.text("% RED.BC.CALC.", 453.8, 438, 5);
  if (Number(cte.percentual_reducao_bc || 0) > 0) P.text(num(cte.percentual_reducao_bc, 2), 493.2, 446, 7, { align: "right" });

  // ---------- Documentos originários ----------
  P.text("DOCUMENTOS ORIGINÁRIOS", 298, 459, 5, { align: "center" });
  [0, 270].forEach((dx) => {
    P.text("TP DOC.", 29.8 + dx, 466, 5);
    P.text("CNPJ / CPF EMITENTE", 59.8 + dx, 466, 5);
    P.text("SÉRIE/NRO.DOCUMENTO", 129.8 + dx, 466, 5);
    P.text("VALOR NOTA", 230.8 + dx, 466, 5);
  });
  const details = asArray<NfeDetail>(cte.nfe_detalhes);
  const byKey = new Map(details.map((d) => [digits(d.chave), d]));
  const docRows: { tipo: string; chave: string; numero: string }[] = asArray<string>(cte.chaves_nfe_ref)
    .map(digits)
    .filter(Boolean)
    .map((k) => {
      const d = byKey.get(k);
      const n = d?.numero || (k.length === 44 ? k.slice(25, 34) : "");
      return { tipo: "NFe", chave: k, numero: n ? `NF: ${String(n).padStart(9, "0")}` : "" };
    });
  const subKey = digits(cte.chave_cte_subcontratacao);
  if (subKey) docRows.push({ tipo: "CT-e", chave: subKey, numero: "" });
  const perPanel = 20;
  docRows.slice(0, perPanel * 2).forEach((row, i) => {
    const dx = i < perPanel ? 0 : 270;
    const top = 472 + (i % perPanel) * 5;
    P.text(row.tipo, 29.8 + dx, top, 5);
    P.text(row.chave, 59.8 + dx, top, 5);
    P.text(row.numero, 233.3 + dx, top, 5, { align: "right" });
  });

  // ---------- Observações ----------
  P.text("OBSERVAÇÕES", 298, 574, 5, { align: "center" });
  const obs: string[] = [];
  if (cte.observacoes) obs.push(String(cte.observacoes));
  if (Number(cte.tp_serv) === 1 && subKey) {
    const subNumber = subKey.length === 44 ? String(Number(subKey.slice(25, 34))) : "";
    obs.push(`SUBCONTRATAÇÃO - CT-E: NÚMERO ${subNumber}, CHAVE ${subKey}`);
  }
  const plates = [cte.placa_veiculo, cte.reboque1_placa, cte.reboque2_placa].filter(Boolean).join(" ");
  if (cte.motorista_nome || plates) {
    obs.push([
      cte.motorista_nome ? `MOTORISTA ${cte.motorista_nome}${driverDoc ? `, CPF ${driverDoc}` : ""}` : "",
      plates ? `CONJUNTO ${plates}` : "",
    ].filter(Boolean).join(", "));
  }
  if (cte.previsao_saida) obs.push(`DATA E HORA PREVISTAS PARA O INÍCIO DA VIAGEM ${dateTimeBR(cte.previsao_saida)}`);
  P.lines(obs.join("\n"), 29.8, 581, 5, 534, 5, 14);

  // ---------- Modal rodoviário ----------
  P.text("INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO", 298, 654.5, 5, { align: "center" });
  const rntrc = digits(cte.rntrc || emit?.rntrc).replace(/^0+(?=\d{8}$)/, "");
  P.text(`RNTRC da Empresa: ${rntrc}`, 30.3, 664.5, 5);
  P.text("USO EXCLUSIVO DO EMISSOR DO CT-E", 205.5, 674.5, 5, { align: "center" });
  P.text("RESERVADO AO FISCO", 476, 674.5, 5, { align: "center" });
  const taxes: string[] = [];
  if (Number(cte.valor_icms || 0) > 0) taxes.push(`ICMS: R$ ${money(cte.valor_icms)}`);
  if (Number(cte.cbs_valor || 0) > 0) taxes.push(`CBS: R$ ${money(cte.cbs_valor)}`);
  const ibs = Number(cte.ibs_uf_valor || 0) + Number(cte.ibs_mun_valor || 0);
  if (ibs > 0) taxes.push(`IBS: R$ ${money(ibs)}`);
  const fiscoText = cte.informacoes_fisco
    || (Number(cte.valor_total_tributos || 0) > 0 ? `Total aprox. tributos: R$ ${money(cte.valor_total_tributos)}.` : taxes.length ? `Total aprox. tributos ${taxes.join(", ")}.` : "");
  P.lines(fiscoText, 30.3, 692, 5, 350, 5, 2);

  // ---------- Canhoto ----------
  P.lines(`DECLARO QUE RECEBI OS VOLUMES DO CONHECIMENTO DE TRANSPORTE ${number} EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE`, 29.8, 752, 5, 452, 5, 1);
  P.text(`CNPJ: ${emit?.cnpj ? maskCNPJ(digits(emit.cnpj)) : ""}`, 29.8, 759, 5);
  P.text(`EMPRESA: ${emit?.razao_social || "SIME TRANSPORTE LTDA"}`, 94.8, 759, 5, { maxW: 385 });
  P.text("CTe Nº", 488.8, 754, 6);
  P.text(number, 560.4, 754, 7, { align: "right" });
  P.text("NOME COMPLETO", 29.8, 769, 5);
  P.text("CPF/RG/DOC", 29.8, 789, 5);
  P.text("ASSINATURA / CARIMBO", 346, 801, 5, { align: "center" });
  P.text("CHEGADA DATA / HORA", 527.5, 769, 5, { align: "center" });
  P.text("SAÍDA DATA / HORA", 527.5, 789, 5, { align: "center" });
}

/** Gera o DACTE (um CT-e por página A4) idêntico ao modelo oficial. */
export async function buildDactePdf(ctes: CtePrintInput[]): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const logo = await loadLogo();
  for (let i = 0; i < ctes.length; i++) {
    if (i > 0) pdf.addPage();
    await drawPage(pdf, ctes[i], logo);
  }
  return pdf;
}

export async function downloadDactePdf(cte: CtePrintInput, filename: string) {
  const pdf = await buildDactePdf([cte]);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
