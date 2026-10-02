// DACTE completo compartilhado pelos talões de produção e serviço.
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, maskCEP, formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { cteOrigemLabel, cteDestinoLabel } from "@/lib/cteRoute";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const money = (value: unknown) => formatCurrency(Number(value || 0));
const decimal = (value: unknown, places = 3) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: places, maximumFractionDigits: places });

const doc = (value?: string | null) => {
  const clean = digits(value);
  if (clean.length === 14) return maskCNPJ(clean);
  if (clean.length === 11) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return value || "—";
};

const formatChave = (value?: string | null) => {
  const clean = digits(value);
  return clean || value || "—";
};

const dateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateBR(value);
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const authorizationData = (cte: CtePrintInput) => {
  let protocol = String(cte.protocolo_autorizacao || "");
  let key = digits(cte.chave_acesso);
  if (protocol.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(protocol) as { protocolo?: unknown; chave?: unknown };
      protocol = String(parsed.protocolo || "");
      if (!key) key = digits(parsed.chave);
    } catch {
      // Mantém o valor original quando integrações antigas gravaram texto simples.
    }
  }
  return { key, protocol };
};

const barcodeDataUrl = (value: string) => {
  if (!value || typeof document === "undefined") return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 0, height: 36, width: 1.25 });
  return `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
};

async function loadLogoDataUrl() {
  if (typeof window === "undefined") return "";
  try {
    const response = await fetch(`${window.location.origin}/logo.png`);
    if (!response.ok) return `${window.location.origin}/logo.png`;
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(blob);
    });
  } catch {
    return `${window.location.origin}/logo.png`;
  }
}

async function loadEmitente(establishmentId?: string | null) {
  if (!establishmentId) return null;
  const { data } = await supabase
    .from("fiscal_establishments")
    .select("razao_social, nome_fantasia, cnpj, inscricao_estadual, rntrc, telefone, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep")
    .eq("id", establishmentId)
    .maybeSingle();
  if (!data) return null;
  const item = data as Record<string, any>;
  return {
    razao_social: item.razao_social || "",
    nome_fantasia: item.nome_fantasia || "",
    cnpj: item.cnpj ? maskCNPJ(item.cnpj) : "",
    ie: item.inscricao_estadual || "",
    rntrc: item.rntrc || "",
    telefone: item.telefone || "",
    endereco: [
      [item.endereco_logradouro, item.endereco_numero].filter(Boolean).join(", "),
      item.endereco_bairro,
      [item.endereco_municipio, item.endereco_uf].filter(Boolean).join(" - "),
      item.endereco_cep ? `CEP ${maskCEP(item.endereco_cep)}` : "",
    ].filter(Boolean).join(" • "),
  };
}

export interface CtePrintInput {
  id?: string;
  numero?: number | null;
  numero_interno?: number | null;
  serie?: number | null;
  tipo_talao?: string | null;
  status?: string | null;
  chave_acesso?: string | null;
  protocolo_autorizacao?: string | null;
  data_emissao?: string | null;
  establishment_id?: string | null;
  [key: string]: any;
}

type ActorPrefix = "remetente" | "expedidor" | "destinatario" | "recebedor" | "tomador";
type Component = { xNome?: string; nome?: string; vComp?: number; valor?: number };
type Quantity = { cUnid?: string; tpMed?: string; qCarga?: number };
type NfeDetail = { chave?: string; natureza?: string; numero?: string; serie?: string; data_emissao?: string; peso?: number; quantidade?: number; especie?: string; cubagem?: number; marca?: string; cfop?: string; ncm?: string; valor_produtos?: number; bc_icms?: number; bc_icms_st?: number; outros?: number; valor?: number };
type OtherDocument = NfeDetail & { descricao?: string; tipo?: string };

const TP_CTE: Record<number, string> = { 0: "Normal", 1: "Complementar", 2: "Anulação", 3: "Substituição" };
const TP_SERV: Record<number, string> = { 0: "Normal", 1: "Subcontratação", 2: "Redespacho", 3: "Redespacho intermediário", 4: "Multimodal" };
const TOMADOR: Record<number, string> = { 0: "Remetente", 1: "Expedidor", 2: "Recebedor", 3: "Destinatário", 4: "Outros" };
const STATUS: Record<string, string> = { rascunho: "RASCUNHO", autorizado: "AUTORIZADO", cancelado: "CANCELADO", rejeitado: "REJEITADO", processando: "PROCESSANDO" };

const STYLE = `<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 6.5px; line-height: 1.06; text-transform: uppercase; }
  .dacte { width: 100%; border: 1px solid #111; }
  .header { display: grid; grid-template-columns: 38% 47% 15%; height: 36mm; border-bottom: 1px solid #111; }
  .header > div { padding: 1.2mm; border-right: 1px solid #111; min-width: 0; overflow: hidden; }
  .header > div:last-child { border-right: 0; }
  .issuer { text-align: center; display: flex; flex-direction: column; justify-content: center; align-items:center; }
  .issuer-logo { display:block; width:auto; height:12mm; object-fit:contain; margin:0 auto .5mm; }
  .issuer strong { font-size: 9px; text-transform: uppercase; margin-top: .5mm; }
  .issuer span { margin-top: .3mm; line-height: 1.08; }
  .fiscal-head { padding: 0 !important; display: flex; flex-direction: column; }
  .title-row { display:grid; grid-template-columns: 72% 28%; border-bottom:1px solid #111; height:13mm; }
  .dacte-title { text-align: center; display: flex; flex-direction: column; justify-content: center; border-right:1px solid #111; padding:3px; }
  .dacte-title b { font-size: 13px; line-height:15px; margin-bottom:2px; }
  .dacte-title span { font-size: 6px; line-height: 1.15; }
  .modal { display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:8px; }
  .doc-meta { display:grid; grid-template-columns:.6fr .5fr .8fr .6fr 1.35fr; height:9mm; border-bottom:1px solid #111; }
  .doc-meta > div { padding:.7mm; border-right:1px solid #111; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.15mm; text-align:center; }
  .doc-meta > div:last-child { border:0; }
  .doc-meta b { display:block; line-height:10px; font-size:7.6px; }
  .access { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:.4mm; gap:.2mm; }
  .key { font: 600 7px/1.05 'Courier New', monospace; text-align:center; white-space:nowrap; }
  .barcode { display:block; width:96%; height:6mm; margin:.2mm auto; object-fit:fill; }
  .qr { display:flex; align-items:center; justify-content:center; padding:2mm !important; }
  .qr img { width:25mm; height:25mm; object-fit:contain; }
  .status { padding: 3px; border: 1px solid #111; text-align: center; font-weight: 700; font-size: 8px; }
  .watermark { font-size: 8px; font-weight: 700; text-align: center; padding: 3px; border-bottom: 1px solid #111; background: #eee; }
  .section-title { height:3.6mm; display:flex; align-items:center; justify-content:center; flex:none; text-align:center; border-top:0; border-bottom:1px solid #111; padding:.7mm; line-height:1; font-weight:400; font-size:5.9px; text-transform:uppercase; background:#fff; position:relative; z-index:1; }
  .section-title + .grid, .section-title + table, .section-title + .notes { border-top: 0; }
  .grid { display: grid; border-bottom: 1px solid #111; }
  .grid:last-child { border-bottom: 0; }
  .c2 { grid-template-columns: repeat(2, minmax(0,1fr)); } .c3 { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .c4 { grid-template-columns: repeat(4,minmax(0,1fr)); } .c5 { grid-template-columns: repeat(5,minmax(0,1fr)); }
  .cell { min-height:7mm; padding:.8mm 1mm; border-right:1px solid #777; border-bottom:1px solid #777; overflow-wrap:anywhere; min-width:0; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:.25mm; text-align:left; }
  .cell:last-child { border-right: 0; }
  .grid > .cell { border-bottom: 0; }
  .grid.c2 > .cell:nth-child(2n), .grid.c3 > .cell:nth-child(3n), .grid.c4 > .cell:nth-child(4n), .grid.c5 > .cell:nth-child(5n) { border-right: 0; }
  .span2 { grid-column: span 2; } .span3 { grid-column: span 3; }
  .label { display:block; color:#222; font-size:5.6px; line-height:1; text-transform:uppercase; margin:0; text-align:left; }
  .value { display:block; font-size:7.1px; font-weight:600; line-height:1.05; min-height:1.8mm; text-align:left; width:100%; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border-right:1px solid #777; border-bottom:1px solid #777; padding:.8mm 1mm; text-align:center; vertical-align:middle; line-height:1.05; overflow-wrap:anywhere; }
  th:last-child, td:last-child { border-right: 0; } tr:last-child td { border-bottom: 0; }
  th { font-size: 6.2px; font-weight:400; text-transform: uppercase; text-align:center; }
  td { font-size: 7px; text-align:center; }
  .right { text-align: right; } .center { text-align: center; }
  .service-component .value.right, td.right { text-align:right; }
  .notes { height:27mm; padding:1.2mm 1.5mm; border-bottom:1px solid #111; line-height:1.08; white-space:pre-wrap; overflow-wrap:anywhere; }
  .actors { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid #111; }
  .actor { padding:.9mm 1.2mm; height:21mm; border-right:1px solid #111; overflow:hidden; }
  .actor:nth-child(even) { border-right:0; }
  .actor:nth-child(-n+2) { border-bottom:1px solid #111; }
  .actor-title { min-height:2.6mm; font-weight:700; font-size:6.6px; line-height:1.05; text-transform:uppercase; margin-bottom:.25mm; text-align:left; border:0; padding:0; }
  .actor-line { display:grid; grid-template-columns:15mm minmax(0,1fr); align-items:center; min-height:3mm; line-height:1; }
  .actor-line b { font-size:6px; line-height:10px; font-weight:400; color:#333; }
  .actor-line span { min-width:0; line-height:10px; overflow-wrap:anywhere; font-size:6.8px; font-weight:600; }
  .actor-pair { display:grid; grid-template-columns:1fr 1fr; }
  .actor-pair > div { padding-right:3px; }
  .actor-pair > div + div { padding-left:3px; padding-right:0; }
  .compact-row { display:grid; min-height:5.5mm; border-bottom:1px solid #111; }
  .compact-row:last-child { border-bottom:0; }
  .compact-field { display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:.2mm; padding:.8mm 1mm; min-width:0; text-align:left; border-right:1px solid #777; }
  .compact-field:last-child { border-right:0; }
  .compact-field .label { margin:0; }
  .compact-field .value { min-width:0; }
  .taker { border-bottom:1px solid #111; }
  .taker-main { grid-template-columns:2.05fr .95fr .28fr .6fr; }
  .taker-address { grid-template-columns:2.05fr .95fr; }
  .taker-docs { grid-template-columns:1.15fr 1.15fr .7fr; }
  .cargo-main { display:grid; grid-template-columns:1.05fr 1.02fr .7fr; border-bottom:1px solid #111; }
  .cargo-main > .cell { min-height:7.5mm; border-bottom:0; }
  .cargo-qty { display:grid; grid-template-columns:40px 1.15fr 1fr 1fr 1fr; border-bottom:1px solid #111; }
  .cargo-qty > .cell { min-height:7mm; border-bottom:0; }
  .service-values { display:grid; grid-template-columns:3fr .9fr; border-bottom:1px solid #111; align-items:stretch; }
  .service-components { display:grid; grid-template-columns:repeat(3, 1fr); }
  .service-component { display:grid; grid-template-columns:1fr .55fr; border-right:1px solid #111; align-items:stretch; }
  .service-component:last-child { border-right:0; }
  .service-component > div { padding:.9mm 1mm; min-height:11mm; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:.25mm; text-align:left; }
  .service-component > div:first-child { border-right:1px solid #777; }
  .service-totals { border-left:1px solid #111; }
  .service-total { min-height:5.5mm; padding:.8mm 1mm; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:.2mm; text-align:left; }
  .service-total + .service-total { border-top:1px solid #111; }
  .service-total .value { text-align:center; font-size:8.4px; }
  .tax-row { display:grid; grid-template-columns:2.7fr .65fr .42fr .68fr .55fr; border-bottom:1px solid #111; align-items:stretch; }
  .tax-row > .cell { border-bottom:0; min-height:7.5mm; }
  .origin-docs { border-bottom:1px solid #111; }
  .origin-doc-panel { min-height:14mm; overflow:hidden; }
  .origin-doc-head, .origin-doc-row { display:grid; grid-template-columns:10mm 30mm minmax(0,1fr) 33mm 20mm; align-items:center; }
  .origin-doc-head { border-bottom:1px solid #bbb; }
  .origin-doc-row .right { text-align:center; }
  .origin-doc-head > div, .origin-doc-row > div { padding:.8mm 1mm; line-height:1.02; text-align:center; border-right:1px solid #bbb; }
  .origin-doc-head > div:last-child, .origin-doc-row > div:last-child { border-right:0; }
  .origin-doc-row + .origin-doc-row { border-top:1px solid #bbb; }
  .origin-doc-head > div { font-size:6.2px; text-transform:uppercase; text-align:center; }
  .origin-doc-row > div { min-width:0; font-size:6.8px; text-align:center; }
  .origin-doc-row .key { font-size:6.7px; letter-spacing:0; white-space:nowrap; }
  .exclusive { display:grid; grid-template-columns:1.3fr .7fr; height:13mm; border-top:0; }
  .exclusive > div { border-right:1px solid #111; padding:1mm; text-align:left; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; }
  .exclusive > div:last-child { border:0; }
  .receipt { margin-top: 17mm; border: 1px solid #111; break-inside: avoid; position:relative; }
  .receipt:before { content:""; position:absolute; left:-1px; right:-1px; top:-7px; border-top:1px dashed #555; }
  .receipt-head { display: grid; grid-template-columns: 1fr 125px; }
  .receipt-head > div { padding: 1mm; border-right: 1px solid #111; line-height:1.1; text-align:left; display:flex; flex-direction:column; justify-content:center; }
  .receipt-head > div:last-child { border-right: 0; }
  .receipt-sign { display: grid; grid-template-columns: 1.4fr .5fr .5fr; border-top: 1px solid #111; min-height: 37px; }
  .receipt-sign > div { padding: 4px; border-right: 1px solid #111; }
  .receipt-sign > div:last-child { border-right: 0; }
  .muted { color: #555; font-weight: 400; }
  .doc-page { page-break-after: always; break-after: page; }
  .doc-page:last-child { page-break-after: auto; break-after: auto; }
</style>`;

function cell(label: string, value: unknown, className = "") {
  const shown = value === null || value === undefined || value === "" ? "—" : value;
  return `<div class="cell ${className}"><span class="label">${esc(label)}</span><span class="value">${esc(shown)}</span></div>`;
}

function actorSection(cte: CtePrintInput, prefix: ActorPrefix, title: string) {
  const name = cte[`${prefix}_nome`];
  return `<div class="actor">
    <div class="actor-title">${esc(title)} &nbsp; ${esc(name || "")}</div>
    <div class="actor-line"><b>ENDEREÇO</b><span>${esc(cte[`${prefix}_endereco`] || "")}</span></div>
    <div class="actor-pair"><div class="actor-line"><b>MUNICÍPIO</b><span>${esc(cte[`${prefix}_municipio_nome`] || cte[`${prefix}_municipio_ibge`] || "")} ${esc(cte[`${prefix}_uf`] ? `- ${cte[`${prefix}_uf`]}` : "")}</span></div><div class="actor-line"><b>CEP</b><span>${esc(cte[`${prefix}_cep`] || "")}</span></div></div>
    <div class="actor-pair"><div class="actor-line"><b>CNPJ/CPF</b><span>${esc(doc(cte[`${prefix}_cnpj`]))}</span></div><div class="actor-line"><b>INSC. EST.</b><span>${esc(cte[`${prefix}_ie`] || "")}</span></div></div>
    <div class="actor-pair"><div class="actor-line"><b>PAÍS</b><span>BRASIL</span></div><div class="actor-line"><b>FONE</b><span>${esc(cte[`${prefix}_telefone`] || "")}</span></div></div>
  </div>`;
}

function documentsHtml(cte: CtePrintInput) {
  const keys = asArray<string>(cte.chaves_nfe_ref).filter(Boolean);
  const details = asArray<NfeDetail>(cte.nfe_detalhes);
  const others = asArray<OtherDocument>(cte.outros_documentos);
  const byKey = new Map(details.map((item) => [digits(item.chave), item]));
  const nfeRows = keys.map((key) => {
    const item = byKey.get(digits(key)) || details.find((detail) => detail.numero && digits(key).slice(25, 34) === String(detail.numero).padStart(9, "0")) || {};
    const cleanKey = digits(key);
    const issuer = cleanKey.length === 44 ? doc(cleanKey.slice(6, 20)) : "—";
    return { type: "NFe", issuer, key: formatChave(key), number: [item.serie, item.numero ? `NF: ${String(item.numero).padStart(9, "0")}` : ""].filter(Boolean).join(" / ") || "—", value: item.valor || item.valor_produtos ? money(item.valor || item.valor_produtos) : "" };
  });
  const otherRows = others.map((item) => `<tr>
    <td>${esc(item.tipo || "Outros")}</td><td>${esc(item.descricao || item.natureza || "—")}</td>
    <td>${esc(item.numero || "—")}</td><td>${esc(item.serie || "—")}</td>
    <td>${esc(item.data_emissao ? formatDateBR(item.data_emissao) : "—")}</td>
    <td class="right">${esc(decimal(item.peso, 3))}</td><td class="right">${esc(money(item.valor || item.valor_produtos))}</td>
  </tr>`).join("");
  const transportKey = digits(cte.chave_cte_subcontratacao);
  const transportRow = cte.chave_cte_subcontratacao
    ? [{ type: "CT-e", issuer: transportKey.length === 44 ? doc(transportKey.slice(6, 20)) : "—", key: formatChave(cte.chave_cte_subcontratacao), number: cte.cte_anterior_numero || "", value: "" }]
    : [];
  const fiscalRows = [...nfeRows, ...transportRow];
  if (!fiscalRows.length && !otherRows) return "";
  const panelHtml = (rows: typeof fiscalRows) => `<div class="origin-doc-panel"><div class="origin-doc-head"><div>Tipo</div><div>CNPJ/CPF emitente</div><div>Chave de acesso</div><div>Série/Nro. documento</div><div>Valor nota</div></div>${rows.map((row) => `<div class="origin-doc-row"><div>${esc(row.type)}</div><div>${esc(row.issuer)}</div><div class="key">${esc(row.key)}</div><div>${esc(row.number)}</div><div class="right">${esc(row.value)}</div></div>`).join("")}</div>`;
  return `<div class="section-title">Documentos originários</div>
    <div class="origin-docs">${panelHtml(fiscalRows)}</div>
    ${otherRows ? `<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Número</th><th>Série</th><th>Emissão</th><th>Peso kg</th><th>Valor</th></tr></thead><tbody>${otherRows}</tbody></table>` : ""}`;
}

function valuesHtml(cte: CtePrintInput) {
  const components = asArray<Component>(cte.componentes_frete);
  const fallback = cte.composicao_frete && typeof cte.composicao_frete === "object"
    ? Object.entries(cte.composicao_frete as Record<string, unknown>)
        .filter(([key, value]) => key !== "regra" && key !== "tarifa_final" && Number(value) !== 0)
        .map(([key, value]) => ({ xNome: key.replace(/_/g, " ").toUpperCase(), vComp: Number(value) }))
    : [];
  const items = components.length ? components : fallback;
  const slots = Array.from({ length: 3 }, (_, index) => items[index]);
  return `<div class="section-title">Componentes do valor da prestação de serviço</div><div class="service-values"><div class="service-components">
      ${slots.map((item, index) => {
        const component = item as Component | undefined;
        const name = component?.xNome || component?.nome || (index === 0 ? "FRETE VALOR" : "");
        const value = component ? component.vComp ?? component.valor : index === 0 ? cte.valor_frete : "";
        return `<div class="service-component"><div><span class="label">Nome</span><span class="value">${esc(name)}</span></div><div><span class="label">Valor</span><span class="value right">${value === "" ? "" : esc(money(value))}</span></div></div>`;
      }).join("")}</div><div class="service-totals"><div class="service-total"><span class="label">Valor total do serviço</span><span class="value">${esc(money(cte.valor_frete))}</span></div><div class="service-total"><span class="label">Valor a receber</span><span class="value">${esc(money(cte.valor_receber ?? cte.valor_frete))}</span></div></div></div>`;
}

function taxesHtml(cte: CtePrintInput) {
  return `<div class="section-title">Informações relativas ao imposto</div>
    <div class="tax-row">
      ${cell("Situação tributária", cte.cst_icms)}
      ${cell("Base de cálculo", money(cte.base_calculo_icms))}
      ${cell("Alíquota ICMS", `${decimal(cte.aliquota_icms, 2)}%`)}
      ${cell("Valor ICMS", money(cte.valor_icms))}
      ${cell("% Red. BC Calc.", `${decimal(cte.percentual_reducao_bc, 2)}%`)}
    </div>
    ${cte.ibs_cbs_cst ? `<div class="grid c5">${cell("CST IBS/CBS", cte.ibs_cbs_cst)}${cell("Classificação tributária", cte.ibs_cbs_class_trib)}${cell("Base IBS/CBS", money(cte.ibs_cbs_base_calculo))}${cell("IBS", money(Number(cte.ibs_uf_valor || 0) + Number(cte.ibs_mun_valor || 0)))}${cell("CBS", money(cte.cbs_valor))}</div>` : ""}`;
}

export async function buildCteHtml(cte: CtePrintInput): Promise<string> {
  const [emit, logoSrc] = await Promise.all([loadEmitente(cte.establishment_id), loadLogoDataUrl()]);
  const isService = cte.tipo_talao === "servico";
  const authorization = authorizationData(cte);
  const authorized = !isService && cte.status === "autorizado" && Boolean(authorization.key && authorization.protocol);
  const consultationUrl = authorization.key ? `https://www.cte.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&chaveAcesso=${authorization.key}` : "";
  const qrCodeUrl = consultationUrl ? await QRCode.toDataURL(consultationUrl, { width: 180, margin: 0, errorCorrectionLevel: "M" }) : "";
  const barcodeUrl = barcodeDataUrl(authorization.key);
  const number = cte.numero ?? cte.numero_interno ?? "—";
  const quantities = asArray<Quantity>(cte.info_quantidade);

  const title = isService ? "DOCUMENTO AUXILIAR DE CT-e DE SERVIÇO" : "DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE ELETRÔNICO";
  const actorPairs = `<div class="actors">${actorSection(cte, "remetente", "Remetente")}${actorSection(cte, "destinatario", "Destinatário")}${actorSection(cte, "expedidor", "Expedidor")}${actorSection(cte, "recebedor", "Recebedor")}</div>`;
  const body = `<div class="dacte">
    ${!authorized ? `<div class="watermark">${isService ? "DOCUMENTO INTERNO — SEM VALOR FISCAL" : "DOCUMENTO NÃO AUTORIZADO — SEM VALOR FISCAL"}</div>` : ""}
    <div class="header">
      <div class="issuer">${logoSrc ? `<img class="issuer-logo" src="${esc(logoSrc)}" alt="SIME Transportes"/>` : ""}<strong>${esc(emit?.razao_social || "Sime Transporte Ltda")}</strong><span>${esc(emit?.endereco || "")}${emit?.telefone ? ` FONE: ${esc(emit.telefone)}` : ""}</span><span>CNPJ: ${esc(emit?.cnpj || "—")} IE: ${esc(emit?.ie || "—")}</span></div>
      <div class="fiscal-head"><div class="title-row"><div class="dacte-title"><b>DACTE</b><span>${esc(title)}</span></div><div class="modal"><span class="label">Modal</span><b>Rodoviário</b></div></div><div class="doc-meta"><div><span class="label">Modelo</span><b>${isService ? "—" : "57"}</b></div><div><span class="label">Série</span><b>${esc(cte.serie ?? "—")}</b></div><div><span class="label">Número</span><b>${esc(number)}</b></div><div><span class="label">Página</span><b>1/1</b></div><div><span class="label">Data e hora de emissão</span><b>${esc(dateTime(cte.data_emissao))}</b></div></div><div class="access">${barcodeUrl ? `<img class="barcode" src="${barcodeUrl}"/>` : ""}<span class="label">Chave de acesso para consulta de autenticidade no site www.cte.fazenda.gov.br</span><div class="key">${esc(formatChave(authorization.key))}</div></div></div>
      <div class="qr">${qrCodeUrl ? `<img src="${qrCodeUrl}" alt="QR Code para consulta do CT-e"/>` : `<b>${esc(STATUS[cte.status || ""] || "INTERNO")}</b>`}</div>
    </div>
    <div class="grid c2">${cell("Tipo do CT-e", TP_CTE[Number(cte.tp_cte)] || "Normal")}${cell("Tipo do serviço", TP_SERV[Number(cte.tp_serv)] || "Normal")}</div>
    <div class="grid c3">${cell("Indicador do CT-e globalizado", cte.globalizado ? "SIM" : "NÃO")}${cell("Informações do CT-e globalizado", cte.informacoes_cte_globalizado)}${cell("Nº protocolo", authorization.protocol ? `${authorization.protocol} ${dateTime(cte.data_autorizacao)}` : "")}</div>
    <div class="grid c2">
      ${cell("CFOP - Natureza da prestação", `${cte.cfop || ""} - ${cte.natureza_operacao || ""}`)}${cell("Insc. SUFRAMA do destinatário", cte.destinatario_suframa)}
    </div>
    <div class="grid c2">${cell("Origem da prestação", cteOrigemLabel(cte))}${cell("Destino da prestação", cteDestinoLabel(cte))}</div>
    ${actorPairs}
    <div class="taker"><div class="compact-row taker-main"><div class="compact-field"><span class="label">Tomador do serviço</span><span class="value">${esc(cte.tomador_nome || "—")}</span></div><div class="compact-field"><span class="label">Município</span><span class="value">${esc(cte.tomador_municipio_nome || cte.tomador_municipio_ibge || "—")}</span></div><div class="compact-field"><span class="label">UF</span><span class="value">${esc(cte.tomador_uf || "—")}</span></div><div class="compact-field"><span class="label">CEP</span><span class="value">${esc(cte.tomador_cep || "—")}</span></div></div><div class="compact-row taker-address"><div class="compact-field"><span class="label">Endereço</span><span class="value">${esc(cte.tomador_endereco || "—")}</span></div><div class="compact-field"><span class="label">País</span><span class="value">BRASIL</span></div></div><div class="compact-row taker-docs"><div class="compact-field"><span class="label">CNPJ/CPF</span><span class="value">${esc(doc(cte.tomador_cnpj))}</span></div><div class="compact-field"><span class="label">Inscrição estadual</span><span class="value">${esc(cte.tomador_ie || "—")}</span></div><div class="compact-field"><span class="label">Fone</span><span class="value">${esc(cte.tomador_telefone || "—")}</span></div></div></div>
    <div class="cargo-main">${cell("Produto predominante", cte.produto_predominante)}${cell("Outras características da carga", cte.caracteristicas_adicionais_carga)}${cell("Valor total da mercadoria", money(cte.valor_carga))}</div>
    <div class="cargo-qty">${cell("Qtd.", "CARGA")}${cell("Peso bruto", `${decimal(quantities[0]?.qCarga ?? cte.peso_bruto, 3)} ${quantities[0]?.cUnid || "KG"}`)}${cell("", "")}${cell("", "")}${cell("", "")}</div>
    ${valuesHtml(cte)}
    ${taxesHtml(cte)}
    ${documentsHtml(cte)}
    <div class="section-title">Observações</div><div class="notes">${esc(cte.observacoes || "")}${cte.previsao_saida ? `\nDATA E HORA PREVISTAS PARA O INÍCIO DA VIAGEM ${esc(dateTime(cte.previsao_saida))}` : ""}</div>
    <div class="section-title">Informações específicas do modal rodoviário</div>
    <div class="grid c3">${cell("RNTRC da empresa", digits(cte.rntrc || emit?.rntrc).replace(/^0/, ""))}${cell("CIOT", cte.ciot)}${cell("Conjunto", [cte.placa_veiculo, cte.reboque1_placa, cte.reboque2_placa].filter(Boolean).join(" / "))}</div>
    <div class="exclusive"><div>USO EXCLUSIVO DO EMISSOR DO CT-e<br><br>${esc(cte.informacoes_fisco || (cte.valor_total_tributos ? `Total aprox. tributos: ${money(cte.valor_total_tributos)}.` : ""))}</div><div>RESERVADO AO FISCO</div></div>
  </div>
  <div class="receipt">
    <div class="receipt-head"><div><b>DECLARO QUE RECEBI OS VOLUMES DO CONHECIMENTO DE TRANSPORTE ${esc(number)} EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE</b><br>CNPJ: ${esc(emit?.cnpj || "—")} &nbsp; EMPRESA: ${esc(emit?.razao_social || "SIME TRANSPORTE LTDA")}</div><div><b>CT-e Nº ${esc(number)}</b></div></div>
    <div class="receipt-sign"><div>NOME COMPLETO<br><br>CPF/RG/DOC<br><br>ASSINATURA / CARIMBO</div><div>CHEGADA DATA / HORA</div><div>SAÍDA DATA / HORA</div></div>
  </div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>DACTE ${esc(number)}</title>${STYLE}</head><body>${body}</body></html>`;
}

/** Combina vários CT-es em um único documento, mantendo um documento por página A4. */
export function combineCtesHtml(htmls: string[]): string {
  if (htmls.length === 0) return "";
  if (htmls.length === 1) return htmls[0];
  const bodies = htmls.map((html) => {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match?.[1] || html;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>DACTE (${htmls.length})</title>${STYLE}</head><body>${bodies.map((body) => `<div class="doc-page">${body}</div>`).join("\n")}</body></html>`;
}