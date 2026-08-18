// Impressão de CT-e (talão de produção/serviço) — um documento por página A4 retrato.
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, maskCEP, formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const doc = (v?: string | null) => {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 14) return maskCNPJ(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "";
};

const formatChave = (chave?: string | null) => {
  const c = String(chave || "").replace(/\D/g, "");
  return c.length === 44 ? c.match(/.{1,4}/g)!.join(" ") : chave || "—";
};

async function loadEmitente(establishmentId?: string | null) {
  if (!establishmentId) return null;
  const { data } = await supabase
    .from("fiscal_establishments")
    .select(
      "razao_social, nome_fantasia, cnpj, inscricao_estadual, rntrc, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep",
    )
    .eq("id", establishmentId)
    .maybeSingle();
  if (!data) return null;
  const d = data as any;
  return {
    razao_social: d.razao_social || "",
    cnpj: d.cnpj ? maskCNPJ(d.cnpj) : "",
    ie: d.inscricao_estadual || "",
    rntrc: d.rntrc || "",
    endereco: [
      [d.endereco_logradouro, d.endereco_numero].filter(Boolean).join(", "),
      d.endereco_bairro,
      [d.endereco_municipio, d.endereco_uf].filter(Boolean).join(" - "),
      d.endereco_cep ? `CEP ${maskCEP(d.endereco_cep)}` : "",
    ]
      .filter(Boolean)
      .join(" • "),
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
  data_carregamento?: string | null;
  natureza_operacao?: string | null;
  cfop?: string | null;
  remetente_nome?: string | null;
  remetente_cnpj?: string | null;
  remetente_endereco?: string | null;
  remetente_uf?: string | null;
  expedidor_nome?: string | null;
  expedidor_cnpj?: string | null;
  recebedor_nome?: string | null;
  recebedor_cnpj?: string | null;
  recebedor_endereco?: string | null;
  recebedor_uf?: string | null;
  destinatario_nome?: string | null;
  destinatario_cnpj?: string | null;
  destinatario_endereco?: string | null;
  destinatario_uf?: string | null;
  tomador_nome?: string | null;
  tomador_cnpj?: string | null;
  municipio_origem_nome?: string | null;
  uf_origem?: string | null;
  municipio_destino_nome?: string | null;
  uf_destino?: string | null;
  placa_veiculo?: string | null;
  motorista_nome?: string | null;
  rntrc?: string | null;
  produto_predominante?: string | null;
  peso_bruto?: number | null;
  valor_carga?: number | null;
  valor_tonelada?: number | null;
  valor_frete?: number | null;
  valor_receber?: number | null;
  observacoes?: string | null;
  chaves_nfe_ref?: string[] | null;
  establishment_id?: string | null;
  [key: string]: any;
}

const STYLE = `<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #111; margin: 0; }
  .box { border: 1px solid #333; }
  .row { display: flex; }
  .row > div { flex: 1; padding: 3px 5px; border-right: 1px solid #333; }
  .row > div:last-child { border-right: none; }
  .row + .row { border-top: 1px solid #333; }
  .lbl { font-size: 7px; text-transform: uppercase; letter-spacing: .3px; color: #555; display: block; }
  .val { font-size: 10px; font-weight: 600; }
  .sec { background: #eee; font-weight: 700; font-size: 8px; text-transform: uppercase; padding: 2px 5px; border-top: 1px solid #333; letter-spacing: .5px; }
  .head { display: flex; align-items: center; gap: 10px; padding: 6px; border-bottom: 1px solid #333; }
  .head h1 { font-size: 13px; margin: 0; }
  .head .sub { font-size: 8px; color: #444; line-height: 1.35; }
  .numbox { text-align: center; min-width: 120px; border: 1px solid #333; padding: 4px; }
  .numbox b { display: block; font-size: 15px; }
  .chave { font-family: monospace; font-size: 9px; letter-spacing: .4px; }
  .obs { padding: 4px 5px; min-height: 34px; font-size: 9px; }
  .sign { display: flex; gap: 16px; margin-top: 14px; }
  .sign div { flex: 1; border-top: 1px solid #333; text-align: center; font-size: 8px; padding-top: 3px; }
</style>`;

function cell(label: string, value: unknown) {
  return `<div><span class="lbl">${esc(label)}</span><span class="val">${esc(value || "—")}</span></div>`;
}

export async function buildCteHtml(cte: CtePrintInput): Promise<string> {
  const emit = await loadEmitente(cte.establishment_id);
  const tipo = cte.tipo_talao === "servico" ? "Talão de Serviço" : "Talão de Produção";
  const peso = Number(cte.peso_bruto || 0);
  const nfes = (cte.chaves_nfe_ref || []).filter(Boolean);

  const body = `
  <div class="box">
    <div class="head">
      <div style="flex:1">
        <h1>${esc(emit?.razao_social || "Sime Transporte Ltda")}</h1>
        <div class="sub">${esc(emit?.endereco || "")}<br/>
          CNPJ: ${esc(emit?.cnpj || "—")} &nbsp;|&nbsp; IE: ${esc(emit?.ie || "—")} &nbsp;|&nbsp; RNTRC: ${esc(emit?.rntrc || cte.rntrc || "—")}
        </div>
      </div>
      <div class="numbox">
        <span class="lbl">CT-e ${esc(tipo)}</span>
        <b>Nº ${esc(cte.numero ?? cte.numero_interno ?? "—")}</b>
        <span class="lbl">Série ${esc(cte.serie ?? "—")} • ${esc(cte.status || "")}</span>
      </div>
    </div>

    <div class="row">
      ${cell("Emissão", cte.data_emissao ? formatDateBR(cte.data_emissao) : "—")}
      ${cell("Carregamento", cte.data_carregamento ? formatDateBR(cte.data_carregamento) : "—")}
      ${cell("CFOP", cte.cfop)}
      ${cell("Natureza da operação", cte.natureza_operacao)}
    </div>
    <div class="row">
      <div style="flex:3"><span class="lbl">Chave de acesso</span><span class="val chave">${esc(formatChave(cte.chave_acesso))}</span></div>
      ${cell("Protocolo", cte.protocolo_autorizacao)}
    </div>

    <div class="sec">Remetente / Expedidor</div>
    <div class="row">
      ${cell("Remetente", cte.remetente_nome)}
      ${cell("CNPJ/CPF", doc(cte.remetente_cnpj))}
      ${cell("UF", cte.remetente_uf)}
    </div>
    <div class="row">
      ${cell("Endereço", cte.remetente_endereco)}
      ${cell("Expedidor", cte.expedidor_nome)}
    </div>

    <div class="sec">Destinatário / Recebedor</div>
    <div class="row">
      ${cell("Destinatário", cte.destinatario_nome)}
      ${cell("CNPJ/CPF", doc(cte.destinatario_cnpj))}
      ${cell("UF", cte.destinatario_uf)}
    </div>
    <div class="row">
      ${cell("Endereço", cte.destinatario_endereco)}
      ${cell("Recebedor", cte.recebedor_nome)}
    </div>

    <div class="sec">Tomador do serviço</div>
    <div class="row">
      ${cell("Nome", cte.tomador_nome)}
      ${cell("CNPJ/CPF", doc(cte.tomador_cnpj))}
    </div>

    <div class="sec">Percurso e veículo</div>
    <div class="row">
      ${cell("Origem", [cte.municipio_origem_nome, cte.uf_origem].filter(Boolean).join(" - "))}
      ${cell("Destino", [cte.municipio_destino_nome, cte.uf_destino].filter(Boolean).join(" - "))}
      ${cell("Placa", cte.placa_veiculo)}
      ${cell("Motorista", cte.motorista_nome)}
    </div>

    <div class="sec">Carga e valores</div>
    <div class="row">
      ${cell("Produto predominante", cte.produto_predominante)}
      ${cell("Peso bruto (kg)", peso ? peso.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—")}
      ${cell("Valor da carga", formatCurrency(Number(cte.valor_carga || 0)))}
    </div>
    <div class="row">
      ${cell("Valor por tonelada", cte.valor_tonelada ? formatCurrency(Number(cte.valor_tonelada)) : "—")}
      ${cell("Valor do frete", formatCurrency(Number(cte.valor_frete || 0)))}
      ${cell("Valor a receber", formatCurrency(Number(cte.valor_receber || cte.valor_frete || 0)))}
    </div>

    ${nfes.length ? `<div class="sec">NF-e referenciadas</div><div class="obs chave">${nfes.map((c) => esc(formatChave(c))).join("<br/>")}</div>` : ""}

    <div class="sec">Observações</div>
    <div class="obs">${esc(cte.observacoes || "")}</div>
  </div>

  <div class="sign">
    <div>Emitente</div>
    <div>Motorista</div>
    <div>Recebedor / Destinatário</div>
  </div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>CT-e ${esc(cte.numero ?? "")}</title>${STYLE}</head><body>${body}</body></html>`;
}

/** Combina vários CT-e em um único documento, um por página A4. */
export function combineCtesHtml(htmls: string[]): string {
  if (htmls.length === 0) return "";
  if (htmls.length === 1) return htmls[0];
  const bodies = htmls.map((h) => {
    const m = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : h;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>CT-e (${htmls.length})</title>
${STYLE}
<style>
  .doc-page { page-break-after: always; break-after: page; }
  .doc-page:last-child { page-break-after: auto; break-after: auto; }
</style>
</head><body>${bodies.map((b) => `<div class="doc-page">${b}</div>`).join("\n")}</body></html>`;
}
