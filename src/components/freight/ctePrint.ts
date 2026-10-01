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
  const groups = clean.length === 44 ? clean.match(/.{1,4}/g) : null;
  return groups ? groups.join(" ") : value || "—";
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

async function loadEmitente(establishmentId?: string | null) {
  if (!establishmentId) return null;
  const { data } = await supabase
    .from("fiscal_establishments")
    .select("razao_social, nome_fantasia, cnpj, inscricao_estadual, rntrc, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep")
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
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 6.5px; }
  .dacte { width: 100%; border: 1px solid #111; }
  .header { display: grid; grid-template-columns: 1.2fr 1.4fr .42fr; min-height: 104px; border-bottom: 1px solid #111; }
  .header > div { padding: 4px; border-right: 1px solid #111; }
  .header > div:last-child { border-right: 0; }
  .issuer { text-align: center; display: flex; flex-direction: column; justify-content: center; }
  .brand { color: #17488d; font-size: 25px; line-height: .9; font-weight: 900; font-style: italic; }
  .brand small { color: #e8ad09; font-size: 6px; display: block; letter-spacing: 2px; font-style: normal; margin-top: 4px; }
  .issuer strong { font-size: 9px; text-transform: uppercase; margin-top: 5px; }
  .issuer span { margin-top: 2px; line-height: 1.15; }
  .fiscal-head { padding: 0 !important; display: flex; flex-direction: column; }
  .title-row { display:grid; grid-template-columns: 1.5fr .55fr; border-bottom:1px solid #111; min-height:42px; }
  .dacte-title { text-align: center; display: flex; flex-direction: column; justify-content: center; border-right:1px solid #111; padding:3px; }
  .dacte-title b { font-size: 13px; }
  .dacte-title span { font-size: 6px; line-height: 1.15; }
  .modal { display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:8px; }
  .doc-meta { display:grid; grid-template-columns:.6fr .5fr .8fr .6fr 1.35fr; min-height:26px; border-bottom:1px solid #111; }
  .doc-meta > div { padding:2px 3px; border-right:1px solid #111; }
  .doc-meta > div:last-child { border:0; }
  .access { display:flex; flex-direction:column; justify-content:center; text-align:center; padding:3px; }
  .key { font: 600 7px/1.25 'Courier New', monospace; text-align: center; word-break: break-word; }
  .barcode { display:block; width:96%; height:28px; margin:3px auto 1px; object-fit:fill; }
  .qr { display:flex; align-items:center; justify-content:center; padding:5px !important; }
  .qr img { width:82px; height:82px; object-fit:contain; }
  .status { padding: 3px; border: 1px solid #111; text-align: center; font-weight: 700; font-size: 8px; }
  .watermark { font-size: 8px; font-weight: 700; text-align: center; padding: 3px; border-bottom: 1px solid #111; background: #eee; }
  .section-title { text-align:center; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 1px 3px; font-weight: 400; text-transform: uppercase; }
  .grid { display: grid; border-bottom: 1px solid #111; }
  .grid:last-child { border-bottom: 0; }
  .c2 { grid-template-columns: repeat(2, minmax(0,1fr)); } .c3 { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .c4 { grid-template-columns: repeat(4,minmax(0,1fr)); } .c5 { grid-template-columns: repeat(5,minmax(0,1fr)); }
  .cell { min-height: 22px; padding: 2px 3px; border-right: 1px solid #777; overflow-wrap: anywhere; }
  .cell:last-child { border-right: 0; }
  .span2 { grid-column: span 2; } .span3 { grid-column: span 3; }
  .label { display: block; color: #222; font-size: 5.7px; text-transform: uppercase; margin-bottom: 1px; }
  .value { display: block; font-size: 6.9px; font-weight: 600; line-height: 1.15; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border-right: 1px solid #777; border-bottom: 1px solid #777; padding: 2px 3px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th:last-child, td:last-child { border-right: 0; } tr:last-child td { border-bottom: 0; }
  th { font-size: 5.7px; font-weight:400; text-transform: uppercase; }
  td { font-size: 6.5px; }
  .right { text-align: right; } .center { text-align: center; }
  .notes { min-height: 70px; padding: 3px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .actors { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid #111; }
  .actor { padding:3px; min-height:72px; border-right:1px solid #111; }
  .actor:nth-child(even) { border-right:0; }
  .actor-title { font-weight:700; font-size:6px; text-transform:uppercase; margin-bottom:2px; }
  .actor-line { display:grid; grid-template-columns:44px 1fr; line-height:1.3; }
  .actor-line b { font-size:5.6px; font-weight:400; }
  .actor-pair { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .exclusive { display:grid; grid-template-columns:1.3fr .7fr; min-height:30px; border-top:1px solid #111; }
  .exclusive > div { border-right:1px solid #111; padding:3px; text-align:center; }
  .exclusive > div:last-child { border:0; }
  .receipt { margin-top: 38px; border: 1px solid #111; break-inside: avoid; }
  .receipt-head { display: grid; grid-template-columns: 1fr 125px; }
  .receipt-head > div { padding: 4px; border-right: 1px solid #111; }
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
    <div class="actor-pair"><div class="actor-line"><b>MUNICÍPIO</b><span>${esc(cte[`${prefix}_municipio_nome`] || cte[`${prefix}_municipio_ibge`] || "")}</span></div><div class="actor-line"><b>UF</b><span>${esc(cte[`${prefix}_uf`] || "")}</span></div></div>
    <div class="actor-pair"><div class="actor-line"><b>CNPJ/CPF</b><span>${esc(doc(cte[`${prefix}_cnpj`]))}</span></div><div class="actor-line"><b>INSC. EST.</b><span>${esc(cte[`${prefix}_ie`] || "")}</span></div></div>
    <div class="actor-line"><b>PAÍS</b><span>BRASIL</span></div>
  </div>`;
}

function documentsHtml(cte: CtePrintInput) {
  const keys = asArray<string>(cte.chaves_nfe_ref).filter(Boolean);
  const details = asArray<NfeDetail>(cte.nfe_detalhes);
  const others = asArray<OtherDocument>(cte.outros_documentos);
  const byKey = new Map(details.map((item) => [digits(item.chave), item]));
  const nfeRows = keys.map((key) => {
    const item = byKey.get(digits(key)) || details.find((detail) => detail.numero && digits(key).slice(25, 34) === String(detail.numero).padStart(9, "0")) || {};
    return `<tr>
      <td style="width:34%" class="key">${esc(formatChave(key))}</td>
      <td>${esc(item.numero || "—")}</td><td>${esc(item.serie || "—")}</td>
      <td>${esc(item.data_emissao ? formatDateBR(item.data_emissao) : "—")}</td>
      <td>${esc(item.natureza || "—")}</td><td>${esc(item.cfop || "—")}</td><td>${esc(item.ncm || "—")}</td>
      <td class="right">${esc(decimal(item.peso, 3))}</td><td class="right">${esc(money(item.valor || item.valor_produtos))}</td>
    </tr>`;
  }).join("");
  const otherRows = others.map((item) => `<tr>
    <td>${esc(item.tipo || "Outros")}</td><td>${esc(item.descricao || item.natureza || "—")}</td>
    <td>${esc(item.numero || "—")}</td><td>${esc(item.serie || "—")}</td>
    <td>${esc(item.data_emissao ? formatDateBR(item.data_emissao) : "—")}</td>
    <td class="right">${esc(decimal(item.peso, 3))}</td><td class="right">${esc(money(item.valor || item.valor_produtos))}</td>
  </tr>`).join("");
  if (!nfeRows && !otherRows && !cte.chave_cte_subcontratacao) return "";
  return `<div class="section-title">Documentos originários</div>
    ${cte.chave_cte_subcontratacao ? `<div class="grid c2">${cell("CT-e anterior", formatChave(cte.chave_cte_subcontratacao), "span2")}</div>` : ""}
    ${nfeRows ? `<table><thead><tr><th>Chave da NF-e</th><th>Número</th><th>Série</th><th>Emissão</th><th>Natureza</th><th>CFOP</th><th>NCM</th><th>Peso kg</th><th>Valor</th></tr></thead><tbody>${nfeRows}</tbody></table>` : ""}
    ${otherRows ? `<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Número</th><th>Série</th><th>Emissão</th><th>Peso kg</th><th>Valor</th></tr></thead><tbody>${otherRows}</tbody></table>` : ""}`;
}

function valuesHtml(cte: CtePrintInput) {
  const components = asArray<Component>(cte.componentes_frete);
  const fallback = cte.composicao_frete && typeof cte.composicao_frete === "object"
    ? Object.entries(cte.composicao_frete as Record<string, unknown>)
        .filter(([key, value]) => key !== "regra" && key !== "tarifa_final" && Number(value) !== 0)
        .map(([key, value]) => ({ xNome: key.replace(/_/g, " ").toUpperCase(), vComp: Number(value) }))
    : [];
  const rows = (components.length ? components : fallback).map((item) =>
    `<tr><td>${esc(item.xNome || item.nome || "Componente")}</td><td class="right">${esc(money(item.vComp ?? item.valor))}</td></tr>`
  ).join("") || `<tr><td>FRETE</td><td class="right">${esc(money(cte.valor_frete))}</td></tr>`;
  return `<div class="section-title">Componentes do valor da prestação</div>
    <table><thead><tr><th>Nome do componente</th><th style="width:28%" class="right">Valor</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="grid c4">
      ${cell("Valor total da prestação", money(cte.valor_frete))}
      ${cell("Valor a receber", money(cte.valor_receber ?? cte.valor_frete))}
      ${cell("Valor da carga", money(cte.valor_carga))}
      ${cell("Valor para averbação", money(cte.valor_carga_averb ?? cte.valor_carga))}
    </div>`;
}

function taxesHtml(cte: CtePrintInput) {
  return `<div class="section-title">Informações relativas ao imposto</div>
    <div class="grid c5">
      ${cell("CST ICMS", cte.cst_icms)}
      ${cell("Base de cálculo", money(cte.base_calculo_icms))}
      ${cell("Alíquota ICMS", `${decimal(cte.aliquota_icms, 2)}%`)}
      ${cell("Valor ICMS", money(cte.valor_icms))}
      ${cell("Total tributos", money(cte.valor_total_tributos))}
    </div>
    <div class="grid c5">
      ${cell("CST IBS/CBS", cte.ibs_cbs_cst)}
      ${cell("Classificação tributária", cte.ibs_cbs_class_trib)}
      ${cell("Base IBS/CBS", money(cte.ibs_cbs_base_calculo))}
      ${cell("IBS", `${money(Number(cte.ibs_uf_valor || 0) + Number(cte.ibs_mun_valor || 0))} (${decimal(Number(cte.ibs_uf_aliquota || 0) + Number(cte.ibs_mun_aliquota || 0), 2)}%)`)}
      ${cell("CBS", `${money(cte.cbs_valor)} (${decimal(cte.cbs_aliquota, 2)}%)`)}
    </div>`;
}

export async function buildCteHtml(cte: CtePrintInput): Promise<string> {
  const emit = await loadEmitente(cte.establishment_id);
  const isService = cte.tipo_talao === "servico";
  const authorization = authorizationData(cte);
  const authorized = !isService && cte.status === "autorizado" && Boolean(authorization.key && authorization.protocol);
  const number = cte.numero ?? cte.numero_interno ?? "—";
  const quantities = asArray<Quantity>(cte.info_quantidade);
  const quantitiesRows = quantities.length
    ? quantities.map((item) => `<tr><td>${esc(item.tpMed || "Quantidade")}</td><td>${esc(item.cUnid || "—")}</td><td class="right">${esc(decimal(item.qCarga, 3))}</td></tr>`).join("")
    : `<tr><td>PESO BRUTO</td><td>KG</td><td class="right">${esc(decimal(cte.peso_bruto, 3))}</td></tr>`;

  const title = isService ? "DOCUMENTO AUXILIAR DE CT-e DE SERVIÇO" : "DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE ELETRÔNICO";
  const body = `<div class="dacte">
    ${!authorized ? `<div class="watermark">${isService ? "DOCUMENTO INTERNO — SEM VALOR FISCAL" : "DOCUMENTO NÃO AUTORIZADO — SEM VALOR FISCAL"}</div>` : ""}
    <div class="header">
      <div class="issuer"><strong>${esc(emit?.razao_social || "Sime Transporte Ltda")}</strong><span>${esc(emit?.nome_fantasia || "")}</span><span>${esc(emit?.endereco || "")}</span><span>CNPJ ${esc(emit?.cnpj || "—")} • IE ${esc(emit?.ie || "—")} • RNTRC ${esc(emit?.rntrc || cte.rntrc || "—")}</span></div>
      <div class="dacte-title"><b>DACTE</b><span>${esc(title)}</span><strong>MODAL RODOVIÁRIO</strong><span>Nº ${esc(number)} • SÉRIE ${esc(cte.serie ?? (isService ? "INTERNA" : "—"))}</span></div>
      <div class="access"><span class="label center">Controle do fisco</span><div class="barcode"></div><div class="key">${esc(formatChave(authorization.key))}</div><div class="status">${esc(STATUS[cte.status || ""] || String(cte.status || "INTERNO").toUpperCase())}</div></div>
    </div>
    <div class="grid c5">
      ${cell("Modelo", isService ? "Interno" : "57")}${cell("Série", cte.serie ?? "—")}${cell("Número", number)}${cell("Data e hora de emissão", dateTime(cte.data_emissao))}${cell("Protocolo de autorização", authorization.protocol)}
    </div>
    <div class="grid c4">
      ${cell("CFOP", cte.cfop)}${cell("Natureza da operação", cte.natureza_operacao, "span2")}${cell("Tipo do CT-e", TP_CTE[Number(cte.tp_cte)] || "Normal")}
    </div>
    <div class="grid c4">
      ${cell("Tipo do serviço", TP_SERV[Number(cte.tp_serv)] || "Normal")}${cell("Tomador", TOMADOR[Number(cte.tomador_tipo)] || "—")}${cell("Início da prestação", cteOrigemLabel(cte))}${cell("Término da prestação", cteDestinoLabel(cte))}
    </div>
    ${actorSection(cte, "remetente", "Remetente")}
    ${actorSection(cte, "expedidor", "Expedidor")}
    ${actorSection(cte, "destinatario", "Destinatário")}
    ${actorSection(cte, "recebedor", "Recebedor")}
    ${actorSection(cte, "tomador", "Tomador do serviço")}
    <div class="section-title">Informações da carga</div>
    <div class="grid c4">
      ${cell("Produto predominante", cte.produto_predominante, "span2")}${cell("Outras características", cte.caracteristicas_adicionais_carga)}${cell("Valor da carga", money(cte.valor_carga))}
    </div>
    <table><thead><tr><th>Tipo de medida</th><th style="width:20%">Unidade</th><th style="width:25%" class="right">Quantidade</th></tr></thead><tbody>${quantitiesRows}</tbody></table>
    ${documentsHtml(cte)}
    ${valuesHtml(cte)}
    ${taxesHtml(cte)}
    <div class="section-title">Dados do modal rodoviário</div>
    <div class="grid c5">
      ${cell("RNTRC", cte.rntrc || emit?.rntrc)}${cell("CIOT", cte.ciot)}${cell("Placa", cte.placa_veiculo)}${cell("Reboque 1", cte.reboque1_placa)}${cell("Reboque 2", cte.reboque2_placa)}
    </div>
    <div class="grid c3">${cell("Motorista", cte.motorista_nome)}${cell("Proprietário / contratado", cte.contratado_nome)}${cell("CNPJ / CPF", doc(cte.contratado_documento))}</div>
    <div class="section-title">Seguro da carga</div>
    <div class="grid c4">${cell("Responsável", Number(cte.seguro_responsavel) === 4 ? "Emitente do CT-e" : cte.seguro_responsavel)}${cell("Seguradora", cte.seguradora_nome)}${cell("CNPJ", doc(cte.seguradora_cnpj))}${cell("Apólice / averbação", [cte.apolice_numero, cte.averbacao_numero].filter(Boolean).join(" / "))}</div>
    <div class="section-title">Dados adicionais</div><div class="notes">${esc(cte.observacoes || "")}</div>
  </div>
  <div class="receipt">
    <div class="receipt-head"><div><b>DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO.</b><br><span class="muted">Nome legível e documento do recebedor</span></div><div><b>CT-e Nº ${esc(number)}</b><br>Série ${esc(cte.serie ?? "—")}</div></div>
    <div class="receipt-sign"><div>ASSINATURA / CARIMBO</div><div>DATA</div><div>HORA</div></div>
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