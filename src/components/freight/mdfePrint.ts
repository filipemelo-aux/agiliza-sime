import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, maskCEP, maskCNPJ } from "@/lib/masks";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

export interface MdfePrintInput {
  id?: string;
  establishment_id?: string | null;
  numero?: number | null;
  serie?: number | null;
  chave_acesso?: string | null;
  protocolo_autorizacao?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const shown = (value: unknown) => value === null || value === undefined || value === "" ? "—" : value;
const array = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const dateTime = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};
const key = (value: unknown) => {
  const clean = digits(value);
  return clean.length === 44 ? clean.match(/.{1,4}/g)?.join(" ") || clean : shown(value);
};
const documentValue = (value: unknown) => {
  const clean = digits(value);
  if (clean.length === 14) return maskCNPJ(clean);
  if (clean.length === 11) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return shown(value);
};

async function imageDataUrl(path: string) {
  try {
    const response = await fetch(path);
    if (!response.ok) return path;
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(blob);
    });
  } catch { return path; }
}

function barcodeDataUrl(value: string) {
  if (!value || typeof document === "undefined") return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 0, height: 34, width: 1.15 });
  return `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
}

async function emitente(id: unknown) {
  if (!id) return null;
  const { data } = await supabase.from("fiscal_establishments").select("razao_social,cnpj,inscricao_estadual,rntrc,endereco_logradouro,endereco_numero,endereco_bairro,endereco_municipio,endereco_uf,endereco_cep").eq("id", String(id)).maybeSingle();
  if (!data) return null;
  const item = data as Record<string, unknown>;
  return {
    nome: item.razao_social,
    cnpj: documentValue(item.cnpj),
    ie: item.inscricao_estadual,
    rntrc: item.rntrc,
    endereco: [[item.endereco_logradouro, item.endereco_numero].filter(Boolean).join(", "), item.endereco_bairro, [item.endereco_municipio, item.endereco_uf].filter(Boolean).join(" - "), item.endereco_cep ? `CEP ${maskCEP(String(item.endereco_cep))}` : ""].filter(Boolean).join(" • "),
  };
}

const field = (label: string, value: unknown, cls = "") => `<div class="field ${cls}"><span>${esc(label)}</span><b>${esc(shown(value))}</b></div>`;

const STYLE = `<style>
@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font:6.4px/1.15 Arial,Helvetica,sans-serif;text-transform:uppercase}.damdfe{width:100%;border:1px solid #111}.header{height:36mm;display:grid;grid-template-columns:38% 47% 15%;border-bottom:1px solid #111}.header>div{min-width:0;border-right:1px solid #111}.header>div:last-child{border:0}.issuer{padding:2mm;text-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center}.issuer img{height:12mm;width:auto;object-fit:contain}.issuer strong{font-size:9px}.issuer small{margin-top:1mm}.fiscal{display:flex;flex-direction:column}.title{height:13mm;display:grid;grid-template-columns:72% 28%;border-bottom:1px solid #111}.title>div{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.title>div:first-child{border-right:1px solid #111}.title b{font-size:13px}.meta{height:9mm;display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #111}.meta>div,.field{padding:1mm;border-right:1px solid #777;display:flex;flex-direction:column;justify-content:center;min-width:0}.meta>div:last-child,.field:last-child{border-right:0}.meta span,.field span{font-size:5.6px;font-weight:400}.meta b,.field b{font-size:7px;margin-top:.5mm}.access{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:.5mm}.access img{width:96%;height:6mm;object-fit:fill}.access b{font:600 6.6px/1.2 'Courier New',monospace}.qr{display:flex;align-items:center;justify-content:center;padding:2mm}.qr img{width:25mm;height:25mm}.watermark{text-align:center;font-size:8px;font-weight:700;padding:1mm;border-bottom:1px solid #111;background:#eee}.section{height:4mm;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #111;font-size:5.8px}.grid{display:grid;border-bottom:1px solid #111;min-height:8mm}.c2{grid-template-columns:repeat(2,1fr)}.c3{grid-template-columns:repeat(3,1fr)}.c4{grid-template-columns:repeat(4,1fr)}.route{grid-template-columns:1fr .45fr 1fr .45fr}.field.center{text-align:center;align-items:center}.keys{min-height:42mm;border-bottom:1px solid #111}.key-head,.key-row{display:grid;grid-template-columns:18mm 1fr 27mm;border-bottom:1px solid #aaa}.key-head>div,.key-row>div{padding:1mm;border-right:1px solid #777;overflow-wrap:anywhere}.key-head>div:last-child,.key-row>div:last-child{border:0}.key-head{font-size:5.6px}.key-row{font:600 6.5px/1.2 'Courier New',monospace}.notes{height:31mm;padding:1.5mm;white-space:pre-wrap;border-bottom:1px solid #111}.footer{display:grid;grid-template-columns:1fr 1fr;min-height:18mm}.footer>div{padding:1.5mm;border-right:1px solid #111}.footer>div:last-child{border:0}.doc-page{page-break-after:always}.doc-page:last-child{page-break-after:auto}
</style>`;

export async function buildMdfeHtml(mdfe: MdfePrintInput): Promise<string> {
  const [issuer, logo] = await Promise.all([emitente(mdfe.establishment_id), imageDataUrl(`${window.location.origin}/logo.png`)]);
  const accessKey = digits(mdfe.chave_acesso);
  const authorized = mdfe.status === "autorizado" || mdfe.status === "encerrado";
  const qrValue = accessKey ? `https://dfe-portal.svrs.rs.gov.br/Mdfe/Consulta?chaveAcesso=${accessKey}` : "";
  const qr = qrValue ? await QRCode.toDataURL(qrValue, { width: 180, margin: 0, errorCorrectionLevel: "M" }) : "";
  const barcode = barcodeDataUrl(accessKey);
  const ctes = array<string>(mdfe.lista_ctes);
  const condutores = [{ nome: mdfe.motorista_nome, cpf: mdfe.motorista_cpf }, ...array<{ nome?: string; cpf?: string }>(mdfe.condutores_extras)];
  const trailers = [mdfe.reboque1_placa, mdfe.reboque2_placa].filter(Boolean).join(" / ");
  const body = `<div class="damdfe">
    ${!authorized ? `<div class="watermark">DOCUMENTO NÃO AUTORIZADO — SEM VALOR FISCAL</div>` : ""}
    <div class="header"><div class="issuer">${logo ? `<img src="${esc(logo)}" alt="SIME">` : ""}<strong>${esc(issuer?.nome || "SIME TRANSPORTE LTDA")}</strong><small>${esc(issuer?.endereco || "")}</small><small>CNPJ: ${esc(issuer?.cnpj || "—")} &nbsp; IE: ${esc(issuer?.ie || "—")}</small></div><div class="fiscal"><div class="title"><div><b>DAMDFE</b><span>DOCUMENTO AUXILIAR DO MANIFESTO ELETRÔNICO DE DOCUMENTOS FISCAIS</span></div><div><span>MODAL</span><b>RODOVIÁRIO</b></div></div><div class="meta"><div><span>MODELO</span><b>58</b></div><div><span>SÉRIE</span><b>${esc(mdfe.serie ?? 1)}</b></div><div><span>NÚMERO</span><b>${esc(mdfe.numero ?? "—")}</b></div><div><span>PÁGINA</span><b>1/1</b></div></div><div class="access">${barcode ? `<img src="${barcode}">` : ""}<span>CHAVE DE ACESSO</span><b>${esc(key(accessKey))}</b></div></div><div class="qr">${qr ? `<img src="${qr}" alt="QR CODE">` : `<b>${esc(mdfe.status || "RASCUNHO")}</b>`}</div></div>
    <div class="grid c3">${field("TIPO DO EMITENTE", "PRESTADOR DE SERVIÇO DE TRANSPORTE")}${field("TIPO DO TRANSPORTADOR", mdfe.tipo_manifesto === "contingencia" ? "CONTINGÊNCIA" : "NORMAL")}${field("PROTOCOLO DE AUTORIZAÇÃO", mdfe.protocolo_autorizacao || "—")}</div>
    <div class="section">INFORMAÇÕES DO PERCURSO</div><div class="grid route">${field("UF DE CARREGAMENTO", mdfe.uf_carregamento, "center")}${field("MUNICÍPIO DE CARREGAMENTO", `${shown(mdfe.municipio_carregamento_nome)} (${shown(mdfe.municipio_carregamento_ibge)})`)}${field("UF DE DESCARREGAMENTO", mdfe.uf_descarregamento, "center")}${field("MUNICÍPIO DE DESCARREGAMENTO", `${shown(mdfe.municipio_descarregamento_nome)} (${shown(mdfe.municipio_descarregamento_ibge)})`)}</div>
    <div class="grid c3">${field("UF(S) DO PERCURSO", array<string>(mdfe.ufs_percurso).join(" / ") || "—")}${field("DATA E HORA DE EMISSÃO", dateTime(mdfe.data_emissao))}${field("DATA E HORA DE INÍCIO DA VIAGEM", dateTime(mdfe.data_saida))}</div>
    <div class="section">INFORMAÇÕES PARA FISCALIZAÇÃO</div><div class="grid c4">${field("QTD. CT-E", ctes.length)}${field("PESO TOTAL DA CARGA", `${Number(mdfe.peso_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} KG`)}${field("VALOR TOTAL DA CARGA", formatCurrency(Number(mdfe.valor_total || 0)))}${field("PRODUTO PREDOMINANTE", mdfe.produto_predominante)}</div>
    <div class="grid c4">${field("TIPO DE CARGA", mdfe.tipo_carga)}${field("QUANTIDADE TOTAL", Number(mdfe.quantidade_total || 0).toLocaleString("pt-BR"))}${field("NCM", mdfe.ncm)}${field("KM INICIAL", mdfe.km_inicial)}</div>
    <div class="section">DOCUMENTOS FISCAIS VINCULADOS</div><div class="keys"><div class="key-head"><div>TIPO</div><div>CHAVE DE ACESSO</div><div>MUNICÍPIO DE DESCARREGAMENTO</div></div>${ctes.map((item) => `<div class="key-row"><div>CT-E</div><div>${esc(key(item))}</div><div>${esc(shown(mdfe.municipio_descarregamento_nome))}/${esc(shown(mdfe.uf_descarregamento))}</div></div>`).join("")}</div>
    <div class="section">INFORMAÇÕES DO MODAL RODOVIÁRIO</div><div class="grid c4">${field("RNTRC", digits(mdfe.rntrc).replace(/^0/, "") || issuer?.rntrc)}${field("PLACA DO VEÍCULO", mdfe.placa_veiculo)}${field("REBOQUES", trailers || "—")}${field("CIOT", mdfe.ciot_numero)}</div>
    <div class="grid c2">${field("CONDUTOR(ES)", condutores.filter((item) => item.nome).map((item) => `${shown(item.nome)} — CPF ${documentValue(item.cpf)}`).join(" • ") || "—")}${field("CONTRATADO", `${shown(mdfe.contratado_nome)} — ${documentValue(mdfe.contratado_documento)}`)}</div>
    <div class="section">SEGURO DA CARGA</div><div class="grid c4">${field("SEGURADORA", mdfe.seguradora_nome)}${field("CNPJ", documentValue(mdfe.seguradora_cnpj))}${field("APÓLICE", mdfe.apolice_numero)}${field("AVERBAÇÃO", mdfe.averbacao_numero)}</div>
    <div class="section">OBSERVAÇÕES</div><div class="notes">${esc(mdfe.observacoes || "")}</div><div class="footer"><div>USO EXCLUSIVO DO EMISSOR DO MDF-E</div><div>RESERVADO AO FISCO</div></div>
  </div>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>DAMDFE ${esc(mdfe.numero || "")}</title>${STYLE}</head><body>${body}</body></html>`;
}