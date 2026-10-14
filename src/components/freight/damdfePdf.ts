// DAMDFE desenhado em vetor (jsPDF), A4 paisagem, reproduzindo o modelo aprovado em 14/10/2026.
// Coordenadas medidas no modelo em px (110 dpi) e convertidas para pt — não depende do navegador.
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, formatCurrency } from "@/lib/masks";

type Dict = Record<string, any>;

export const DAMDFE_LAYOUT = Object.freeze({
  version: "oficial-58-2026-10-14",
  width: 841.89,
  height: 595.28,
});

const K = 72 / 110; // px do modelo -> pt
const k = (v: number) => v * K;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const up = (v: unknown) => String(v ?? "").toLocaleUpperCase("pt-BR");
const money = (v: unknown) => formatCurrency(Number(v || 0)).replace(/^R\$\s?/, "");
const docMask = (v?: unknown) => {
  const d = digits(v);
  if (d.length === 14) return maskCNPJ(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return String(v ?? "");
};
const asArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string" && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};
const dateTimeBR = (value?: unknown) => {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value || "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}:${p("second")}`;
};
const plateFmt = (v: unknown) => { const s = up(v).replace(/[^A-Z0-9]/g, ""); return s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : s; };

const TIPO_CARGA: Record<string, string> = {
  "01": "Granel sólido", "02": "Granel líquido", "03": "Frigorificada", "04": "Conteinerizada", "05": "Carga geral", "06": "Neogranel",
  "07": "Perigosa (granel sólido)", "08": "Perigosa (granel líquido)", "09": "Perigosa (frigorificada)", "10": "Perigosa (conteinerizada)", "11": "Perigosa (carga geral)",
};

class Painter {
  constructor(public pdf: jsPDF) {}
  font(size: number, bold = false) { this.pdf.setFont("helvetica", bold ? "bold" : "normal"); this.pdf.setFontSize(size); }
  /** x/top em px do modelo; size em pt. */
  text(value: unknown, x: number, top: number, size: number, o: { bold?: boolean; align?: "left" | "center" | "right"; maxW?: number; upper?: boolean } = {}) {
    let t = o.upper === false ? String(value ?? "") : String(value ?? "");
    if (!t.trim()) return;
    this.font(size, o.bold);
    let s = size;
    if (o.maxW) {
      const max = k(o.maxW);
      while (this.pdf.getTextWidth(t) > max && s > size * 0.65) { s -= 0.2; this.font(s, o.bold); }
      while (t.length > 1 && this.pdf.getTextWidth(t) > max) t = t.slice(0, -1);
    }
    this.pdf.text(t, k(x), k(top) + s * 0.8, { align: o.align || "left" });
  }
  line(x1: number, y1: number, x2: number, y2: number) { this.pdf.line(k(x1), k(y1), k(x2), k(y2)); }
  rect(x1: number, y1: number, x2: number, y2: number) { this.pdf.rect(k(x1), k(y1), k(x2 - x1), k(y2 - y1), "S"); }
  hl(x1: number, x2: number, y: number) { this.line(x1, y, x2, y); }
  vl(x: number, y1: number, y2: number) { this.line(x, y1, x, y2); }
}

function drawBarcode(pdf: jsPDF, key: string) {
  if (key.length !== 44) return;
  const target: Dict = {};
  JsBarcode(target as any, key, { format: "CODE128C" });
  const data: string = (target.encodings || []).map((e: Dict) => e.data).join("");
  if (!data) return;
  const x0 = k(772), width = k(438), top = k(80), height = k(48);
  const m = width / data.length;
  pdf.setFillColor(0, 0, 0);
  let i = 0;
  while (i < data.length) {
    if (data[i] === "1") { let j = i; while (j < data.length && data[j] === "1") j++; pdf.rect(x0 + i * m, top, (j - i) * m, height, "F"); i = j; } else i++;
  }
}

function drawQr(pdf: jsPDF, url: string) {
  if (!url) return;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, box = k(108), x0 = k(618), y0 = k(60), c = box / n;
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.modules.get(r, col)) pdf.rect(x0 + col * c, y0 + r * c, c + 0.05, c + 0.05, "F");
}

async function loadLogo(): Promise<{ data: string; w: number; h: number } | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}/logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(typeof r.result === "string" ? r.result : ""); r.readAsDataURL(blob); });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 }); img.onerror = () => resolve({ w: 1, h: 1 }); img.src = data; });
    return { data, ...dims };
  } catch { return null; }
}

function authorization(m: Dict) {
  let protocol = String(m.protocolo_autorizacao || "");
  let receivedAt = String(m.data_autorizacao || "");
  if (protocol.trim().startsWith("{")) {
    try { const p = JSON.parse(protocol); protocol = String(p.protocolo || ""); receivedAt = String(p.data_recebimento || receivedAt); } catch { /* texto simples */ }
  }
  return { protocol, receivedAt };
}

async function loadData(m: Dict) {
  const ids = Array.from(new Set([...asArray<string>(m.lista_ctes), ...asArray<string>(m.cte_ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(String(x)))));
  const [estRes, cteRes, vehRes] = await Promise.all([
    m.establishment_id ? supabase.from("fiscal_establishments").select("razao_social,cnpj,inscricao_estadual,rntrc,endereco_logradouro,endereco_numero,endereco_bairro,endereco_municipio,endereco_uf,endereco_cep,profile_id").eq("id", m.establishment_id).maybeSingle() : Promise.resolve({ data: null }),
    ids.length ? supabase.from("ctes").select("*").in("id", ids) : Promise.resolve({ data: [] }),
    m.veiculo_id ? supabase.from("vehicles").select("plate,renavam,antt_number,owner_id,trailer_plate_1,trailer_plate_2,trailer_plate_3,trailer_renavam_1,trailer_renavam_2,trailer_renavam_3").eq("id", m.veiculo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const emit = (estRes.data as Dict) || {};
  if (emit.profile_id) {
    const { data } = await supabase.from("profiles").select("phone,email").eq("id", emit.profile_id).maybeSingle();
    emit.telefone = (data as Dict | null)?.phone || ""; emit.email = (data as Dict | null)?.email || "";
  }
  const veh = (vehRes.data as Dict) || null;
  let owner: Dict = {};
  if (veh?.owner_id) {
    const { data } = await supabase.from("profiles").select("full_name,razao_social,cnpj").eq("id", veh.owner_id).maybeSingle();
    owner = (data as Dict) || {};
  }
  const ctes = ((cteRes.data as Dict[]) || []).sort((a, b) => Number(a.numero || 0) - Number(b.numero || 0));
  const estIds = Array.from(new Set(ctes.map((c) => c.establishment_id).filter(Boolean)));
  const estNames = new Map<string, string>();
  if (estIds.length) {
    const { data } = await supabase.from("fiscal_establishments").select("id,descricao,type,endereco_uf").in("id", estIds);
    for (const e of (data as Dict[]) || []) estNames.set(e.id, e.descricao || (e.type === "matriz" ? "Matriz" : `Filial ${e.endereco_uf || ""}`.trim()));
  }
  return { emit, veh, owner, ctes, estNames };
}

async function drawPage(pdf: jsPDF, m: Dict, logo: Awaited<ReturnType<typeof loadLogo>>) {
  const P = new Painter(pdf);
  const { emit, veh, owner, ctes, estNames } = await loadData(m);
  const key = digits(m.chave_acesso).slice(-44);
  const auth = authorization(m);
  pdf.setDrawColor(0); pdf.setLineWidth(0.6);

  // ===== Cabeçalho =====
  P.rect(31, 30, 1259, 240);
  P.vl(610, 30, 197); P.vl(733, 30, 240); P.hl(733, 1259, 63); P.hl(31, 1259, 197); P.hl(733, 1259, 218);
  if (logo) {
    const maxW = k(150), maxH = k(130);
    const r = Math.min(maxW / logo.w, maxH / logo.h);
    const w = logo.w * r, h = logo.h * r;
    pdf.addImage(logo.data, "PNG", k(108) - w / 2, k(113) - h / 2, w, h);
  }
  const cep = digits(emit.endereco_cep);
  P.text(up(emit.razao_social || "SIME TRANSPORTE LTDA"), 397, 63, 11, { align: "center", maxW: 360 });
  P.text(`CNPJ: ${docMask(emit.cnpj)} IE: ${emit.inscricao_estadual || ""}`, 397, 82, 7.6, { align: "center" });
  P.text(up([[emit.endereco_logradouro, emit.endereco_numero].filter(Boolean).join(", "), emit.endereco_bairro].filter(Boolean).join(" - ")), 397, 97, 7.6, { align: "center", maxW: 360 });
  P.text(`CEP: ${cep}, ${up(emit.endereco_municipio || "")} - ${up(emit.endereco_uf || "")}`, 397, 111, 7.6, { align: "center", maxW: 360 });
  P.text(`RNTRC: ${digits(emit.rntrc)}`, 397, 125, 7.6, { align: "center" });
  P.text(`Fone: ${emit.telefone || ""} - Email:${emit.email || ""}`, 397, 140, 7.6, { align: "center", maxW: 360 });
  drawQr(pdf, key ? `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${key}&tpAmb=1` : "");
  P.text("DAMDFE", 762, 36, 13, { bold: true });
  P.text("Documento Auxiliar de Manifesto Eletrônico de Documentos Fiscais", 874, 40, 7.6);
  P.text("Controle do Fisco", 996, 67, 6.2, { bold: true, align: "center" });
  drawBarcode(pdf, key);
  P.text("Chave de acesso", 738, 161, 7.6, { bold: true });
  P.text(key ? key.match(/.{1,4}/g)!.join(".") : "", 997, 178, 10, { align: "center" });

  // Linha Modelo/Série/...
  const cols = [31, 115, 175, 297, 385, 538, 623, 733];
  cols.slice(1).forEach((x) => P.vl(x, 197, 240));
  const heads = ["Modelo", "Série", "Número", "FL", "Data e Hora de Emissão", "UF. Carreg.", "UF. Descarreg."];
  heads.forEach((h, i) => P.text(h, cols[i] + 3, 202, 7.4, { bold: true }));
  const vals = ["58", String(m.serie ?? 1), String(m.numero ?? ""), "1/1", dateTimeBR(m.data_emissao), up(m.uf_carregamento), up(m.uf_descarregamento)];
  const valX = [73, 145, 236, 341, 461, 580, 678];
  vals.forEach((v, i) => P.text(v, valX[i], 221, 7.6, { align: "center" }));
  P.text("Protocolo de autorização de uso", 738, 201, 7.4, { bold: true });
  P.text(auth.protocol, 985, 221, 7.6, { align: "right" });
  P.text(auth.protocol ? dateTimeBR(auth.receivedAt) : "", 1004, 221, 7.6);

  // ===== Modal rodoviário =====
  P.rect(31, 247, 1259, 463);
  P.hl(31, 1259, 265); P.hl(31, 1259, 291); P.hl(31, 1259, 309); P.hl(31, 1259, 327);
  P.text("Modal Rodoviário de Carga", 645, 251, 7.6, { bold: true, align: "center" });
  [150, 270, 462, 662, 1024].forEach((x) => P.vl(x, 265, 291));
  const qtdNfe = ctes.reduce((s, c) => s + asArray(c.nfe_detalhes).length, 0);
  const peso = Number(m.peso_total || 0) || ctes.reduce((s, c) => s + Number(c.peso_bruto || 0), 0);
  const tc = String(m.tipo_carga || "").padStart(2, "0");
  const lab = (l: string, v: string, x: number, maxW: number) => { P.font(6.6, true); const w = pdf.getTextWidth(l) / K; P.text(l, x, 272, 6.6, { bold: true }); P.text(v, x + w + 6, 272, 6.6, { maxW: maxW - w - 6 }); };
  lab("Qtd. CT-e", String(ctes.length || asArray(m.lista_ctes).length), 37, 110);
  lab("Qtd. NF-e", qtdNfe ? String(qtdNfe) : "", 157, 110);
  lab("Peso Total (Kg)", peso.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 276, 180);
  lab("CIOT", digits(m.ciot_numero), 469, 185);
  lab("CPF/CNPJ Responsável", m.ciot_numero ? docMask(m.ciot_documento) : "", 669, 350);
  lab("Tipo de Carga", TIPO_CARGA[tc] ? `${Number(tc)} - ${TIPO_CARGA[tc]}` : "", 1031, 225);

  // Veículos / Condutores
  P.vl(733, 291, 463); P.vl(826, 309, 463);
  [125, 185, 259, 365].forEach((x) => P.vl(x, 309, 407));
  P.hl(31, 733, 407); P.hl(31, 733, 428); [220, 393, 526].forEach((x) => P.vl(x, 407, 463));
  P.text("Veículos", 34, 295, 7.6, { bold: true });
  P.text("Condutores", 737, 293, 7.6, { bold: true });
  [["Placa", 34], ["RNTRC", 128], ["Renavam", 188], ["Doc Proprietário", 262], ["Nome Proprietário", 368]].forEach(([t, x]) => P.text(t, Number(x), 312, 7.6, { bold: true }));
  P.text("CPF", 737, 312, 7.6, { bold: true }); P.text("Nome", 829, 312, 7.6, { bold: true });
  const ufV = up(emit.endereco_uf || m.uf_carregamento || "");
  const plates: { placa: string; renavam: string }[] = [
    { placa: m.placa_veiculo || veh?.plate, renavam: veh?.renavam || "" },
    { placa: m.reboque1_placa || veh?.trailer_plate_1, renavam: veh?.trailer_renavam_1 || "" },
    { placa: m.reboque2_placa || veh?.trailer_plate_2, renavam: veh?.trailer_renavam_2 || "" },
    { placa: veh?.trailer_plate_3, renavam: veh?.trailer_renavam_3 || "" },
  ].filter((p) => p.placa);
  const rntrc = digits(veh?.antt_number || m.rntrc || emit.rntrc);
  const ownerDoc = digits(owner.cnpj);
  const ownerName = up(owner.razao_social || owner.full_name || "");
  plates.slice(0, 4).forEach((p, i) => {
    const y = 333 + i * 20;
    P.text(`${plateFmt(p.placa)}/${ufV}`, 34, y, 7.4);
    P.text(rntrc, 128, y, 7.4, { maxW: 56 });
    P.text(digits(p.renavam), 188, y, 7.4, { maxW: 70 });
    P.text(ownerDoc, 262, y, 7.4, { maxW: 102 });
    P.text(ownerName, 368, y, 7.4, { maxW: 362 });
  });
  const condutores = [{ nome: m.motorista_nome, cpf: m.motorista_cpf }, ...asArray<Dict>(m.condutores_extras)].filter((c) => c.nome || c.cpf);
  condutores.slice(0, 6).forEach((c, i) => {
    const y = 333 + i * 20;
    P.text(digits(c.cpf), 737, y, 7.4);
    P.text(up(c.nome), 829, y, 7.4, { maxW: 428 });
  });
  P.text("Responsável", 34, 411, 7.6, { bold: true }); P.text("Fornecedor", 223, 411, 7.6, { bold: true });
  P.text("Nº Comp.", 396, 413, 7.6, { bold: true }); P.text("Vale Pedágio", 529, 413, 7.6, { bold: true });
  asArray<Dict>(m.vale_pedagio).slice(0, 1).forEach((v) => {
    P.text(docMask(v.cnpj_pagador || v.responsavel || ""), 34, 440, 7, { maxW: 183 });
    P.text(docMask(v.cnpj_fornecedor || v.fornecedor || ""), 223, 440, 7, { maxW: 168 });
    P.text(v.numero_comprovante || v.comprovante || "", 396, 440, 7, { maxW: 128 });
    P.text(v.valor ? money(v.valor) : "", 529, 440, 7, { maxW: 200 });
  });

  // ===== Documentos =====
  const rowsTop = 505, rowH = 33;
  const body = Math.max(1, Math.min(ctes.length, 6));
  const totTop = rowsTop + rowH * body, bottom = totTop + 15;
  P.rect(31, 490, 1259, bottom);
  P.hl(31, 1259, 505); P.hl(31, 1259, totTop);
  const dc = [171, 487, 806, 964, 1029, 1101, 1174];
  dc.forEach((x) => P.vl(x, 490, totTop));
  [964, 1029, 1101, 1174].forEach((x) => P.vl(x, totTop, bottom));
  const dh: [string, number][] = [["Conhecimento", 101], ["Remetente", 329], ["Destinatário", 646], ["Doc.", 885], ["Tipo", 996], ["Quant.", 1065], ["Merc. (R$)", 1137], ["Frete (R$)", 1216]];
  dh.forEach(([t, x]) => P.text(t, x, 494, 6.2, { bold: true, align: "center" }));
  let tq = 0, tm = 0, tf = 0;
  ctes.slice(0, 6).forEach((c, i) => {
    const y = rowsTop + i * rowH;
    const est = estNames.get(c.establishment_id) || "";
    P.text(`CTe - ${est ? `${est} - ` : ""}${c.numero ?? ""}`, 37, y + 12, 6.2, { maxW: 130 });
    P.text(up(c.remetente_nome), 178, y + 6, 6.2, { maxW: 305 });
    P.text(up([c.remetente_endereco, c.municipio_origem_nome].filter(Boolean).join(" ")), 178, y + 15, 5.6, { maxW: 305 });
    P.text(up(c.remetente_uf || c.uf_origem), 178, y + 24, 5.6);
    P.text(up(c.destinatario_nome), 494, y + 6, 6.2, { maxW: 308 });
    P.text(up([c.destinatario_endereco, c.municipio_destino_nome, c.destinatario_uf || c.uf_destino].filter(Boolean).join(" ")), 494, y + 18, 5.6, { maxW: 308 });
    const nfs = asArray<Dict>(c.nfe_detalhes).map((n) => String(n.numero || "").replace(/^0+/, "") || digits(n.chave).slice(25, 34).replace(/^0+/, "")).filter(Boolean);
    P.text(nfs.join(", "), 885, y + 12, 6.2, { align: "center", maxW: 152 });
    const aPagar = String(c.tomador_tipo ?? "0") === "3" || String(c.tomador_tipo ?? "0") === "2";
    P.text(aPagar ? "A PAGAR" : "PAGO", 996, y + 12, 6.2, { align: "center" });
    const q = asArray<Dict>(c.info_quantidade)[0];
    let qtd = Number(q?.qCarga || 0);
    if (q && String(q.cUnid) === "01") qtd = qtd / 1000;
    if (!qtd) qtd = Number(c.peso_bruto || 0) / 1000;
    qtd = Math.round(qtd);
    tq += qtd; tm += Number(c.valor_carga || 0); tf += Number(c.valor_frete || 0);
    P.text(String(qtd), 1097, y + 12, 6.2, { align: "right" });
    P.text(money(c.valor_carga), 1170, y + 12, 6.2, { align: "right" });
    P.text(money(c.valor_frete), 1255, y + 12, 6.2, { align: "right" });
  });
  P.text("Totais", 996, totTop + 3, 6.8, { bold: true, align: "center" });
  P.text(String(tq), 1097, totTop + 3, 6.8, { bold: true, align: "right" });
  P.text(money(tm), 1170, totTop + 3, 6.8, { bold: true, align: "right" });
  P.text(money(tf), 1255, totTop + 3, 6.8, { bold: true, align: "right" });

  // ===== Observações =====
  const oT = bottom + 32, oB = oT + 63, oM = oT + 32;
  P.rect(31, oT, 1259, oB);
  [120, 979, 1117].forEach((x) => P.vl(x, oT, oB)); P.hl(979, 1259, oM);
  P.text("Observações", 37, oT + 25, 7.6, { bold: true });
  const decl = "DECLARO TER RECEBIDO AS MERCADORIAS ACIMA PARA TRANSPORTE EM PERFEITO ESTADO, COMPROMETENDO-ME A ENTREGÁ-LA NO DESTINO, NOS PRAZOS E CONDIÇÕES AJUSTADOS, RESPONSABILIZANDO-ME PELA GUARDA E CUSTÓDIA ATÉ O DESTINO.";
  P.font(5.6);
  const obsLines = (pdf.splitTextToSize([decl, up(m.observacoes || "")].filter(Boolean).join("\n"), k(850)) as string[]).slice(0, 6);
  obsLines.forEach((l, i) => pdf.text(l, k(128), k(oT + 5) + 4.6 + i * 6.4));
  P.text("Km Saída", 1048, oT + 3, 6.2, { align: "center" });
  P.text("KM Chegada", 1188, oT + 3, 6.2, { align: "center" });
  P.text("Data/Hora Chegada", 1048, oM + 3, 6.2, { align: "center" });
  P.text("Motorista", 1188, oM + 3, 6.2, { align: "center" });
  if (m.km_inicial) P.text(String(m.km_inicial), 1048, oT + 16, 7, { align: "center" });

  // Marca d'água para documento sem autorização
  if (!["autorizado", "encerrado", "cancelado"].includes(String(m.status || ""))) {
    P.text("SEM VALOR FISCAL — DOCUMENTO NÃO AUTORIZADO", 645, 470, 9, { bold: true, align: "center" });
  } else if (m.status === "cancelado") {
    P.text("MDF-E CANCELADO", 645, 470, 9, { bold: true, align: "center" });
  }

  // ===== Rodapé =====
  P.hl(35, 1259, 835);
  P.text("Agiliza TMS - FSM Systems", 582, 851, 6.6, { align: "center" });
}

/** Gera o DAMDFE (um MDF-e por página, A4 paisagem) idêntico ao modelo aprovado. */
export async function buildDamdfePdf(mdfes: Dict[]): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  const logo = await loadLogo();
  for (let i = 0; i < mdfes.length; i++) {
    if (i > 0) pdf.addPage("a4", "landscape");
    await drawPage(pdf, mdfes[i], logo);
  }
  return pdf;
}
