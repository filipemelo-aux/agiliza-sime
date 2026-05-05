// Shared helper that fetches full driver/owner details and builds the
// rich Contrato de Afretamento HTML, modeled after the Bsoft TMS layout.
import { supabase } from "@/integrations/supabase/client";
import { maskCPF, maskCNPJ, maskCEP, maskPhone } from "@/lib/masks";

export interface ContractPrintInput {
  numero: number;
  data_contrato?: string | null; // ISO date "YYYY-MM-DD"
  contratado_id?: string | null;
  contratado_nome: string;
  contratado_documento?: string | null;
  contratado_tipo: string; // 'PF' | 'PJ'
  motorista_id?: string | null;
  motorista_nome?: string | null;
  motorista_cpf?: string | null;
  vehicle_id?: string | null;
  placa_veiculo?: string | null;
  veiculo_modelo?: string | null;
  municipio_origem?: string | null;
  uf_origem?: string | null;
  municipio_destino?: string | null;
  uf_destino?: string | null;
  natureza_carga?: string | null;
  peso_kg: number;
  valor_tonelada: number;
  valor_total: number;
  observacoes?: string | null;
  cte_id?: string | null;
  cte?: { numero?: number | null; serie?: number | null; tipo_talao?: string | null } | null;
}

interface CteFullInfo {
  numero: number | null;
  numero_interno: number | null;
  serie: number | null;
  tipo_talao: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  valor_frete: number | null;
  valor_carga: number | null;
  chaves_nfe_ref: string[] | null;
  protocolo: string | null;
}

async function loadCteInfo(cteId: string | null | undefined, fallback?: ContractPrintInput["cte"]): Promise<CteFullInfo | null> {
  if (!cteId) {
    if (fallback?.numero) {
      return {
        numero: fallback.numero ?? null,
        numero_interno: null,
        serie: fallback.serie ?? null,
        tipo_talao: fallback.tipo_talao ?? null,
        chave_acesso: null, data_emissao: null, valor_frete: null,
        valor_carga: null, chaves_nfe_ref: null, protocolo: null,
      };
    }
    return null;
  }
  const { data } = await supabase
    .from("ctes")
    .select("numero, numero_interno, serie, tipo_talao, chave_acesso, data_emissao, valor_frete, valor_carga, chaves_nfe_ref, protocolo_autorizacao")
    .eq("id", cteId)
    .maybeSingle();
  if (!data) return null;
  return {
    numero: (data as any).numero,
    numero_interno: (data as any).numero_interno,
    serie: (data as any).serie,
    tipo_talao: (data as any).tipo_talao,
    chave_acesso: (data as any).chave_acesso,
    data_emissao: (data as any).data_emissao,
    valor_frete: (data as any).valor_frete,
    valor_carga: (data as any).valor_carga,
    chaves_nfe_ref: (data as any).chaves_nfe_ref,
    protocolo: (data as any).protocolo_autorizacao,
  };
}

function formatChave(chave: string | null | undefined): string {
  if (!chave) return "-";
  const c = chave.replace(/\D/g, "");
  if (c.length !== 44) return chave;
  return c.match(/.{1,4}/g)!.join(" ");
}

interface PartyDetails {
  nome: string;
  documento: string;
  tipo: "PF" | "PJ";
  ie: string;
  rg: string;
  pis: string;
  rntrc: string;
  email: string;
  telefone: string;
  endereco: string;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
}

const empty = (): PartyDetails => ({
  nome: "",
  documento: "",
  tipo: "PF",
  ie: "",
  rg: "",
  pis: "",
  rntrc: "",
  email: "",
  telefone: "",
  endereco: "",
  cnh_numero: "",
  cnh_categoria: "",
  cnh_validade: "",
});

async function loadParty(profileId: string | null | undefined, fallbackName?: string | null, fallbackDoc?: string | null, fallbackTipo?: string | null): Promise<PartyDetails> {
  const out = empty();
  out.nome = fallbackName || "";
  out.documento = fallbackDoc || "";
  out.tipo = (fallbackTipo === "PJ" ? "PJ" : "PF");

  if (!profileId) return out;

  const { data: prof } = await supabase
    .from("profiles")
    .select(`
      id, user_id, full_name, razao_social, nome_fantasia, person_type, cnpj,
      inscricao_estadual, email, phone,
      address_street, address_number, address_complement, address_neighborhood,
      address_city, address_state, address_zip
    `)
    .eq("id", profileId)
    .maybeSingle();

  if (prof) {
    const ptype = (prof.person_type || "").toString().toLowerCase();
    const isPJ = ptype === "pj" || ptype === "cnpj" || ptype === "juridica" || (!!prof.cnpj && prof.cnpj.replace(/\D/g, "").length === 14);
    out.tipo = isPJ ? "PJ" : "PF";
    out.nome = prof.razao_social || prof.full_name || out.nome;
    if (isPJ && prof.cnpj) out.documento = maskCNPJ(prof.cnpj);
    out.ie = prof.inscricao_estadual || "";
    out.email = prof.email || "";
    out.telefone = prof.phone ? maskPhone(prof.phone) : "";
    const partes = [
      [prof.address_street, prof.address_number].filter(Boolean).join(", "),
      prof.address_complement,
      prof.address_neighborhood,
      prof.address_zip ? `CEP: ${maskCEP(prof.address_zip)}` : "",
      [prof.address_city, prof.address_state].filter(Boolean).join(" - "),
    ].filter((s) => s && String(s).trim().length > 0);
    out.endereco = partes.join(", ");
  }

  // Driver documents (CPF, CNH) — keyed by profiles.user_id (= auth.users.id)
  const authUid = (prof as any)?.user_id || null;
  if (authUid) {
    const { data: doc } = await supabase
      .from("driver_documents")
      .select("cpf, cnh_number, cnh_category, cnh_expiry")
      .eq("user_id", authUid)
      .maybeSingle();
    if (doc) {
      if (out.tipo === "PF" && doc.cpf) out.documento = maskCPF(doc.cpf);
      out.cnh_numero = doc.cnh_number || "";
      out.cnh_categoria = doc.cnh_category || "";
      out.cnh_validade = doc.cnh_expiry
        ? new Date(doc.cnh_expiry + "T12:00:00").toLocaleDateString("pt-BR")
        : "";
    }
  }
  // Fallback PF: usa cnpj do profile se for 11 dígitos (CPF reaproveitado)
  if (out.tipo === "PF" && !out.documento && (prof as any)?.cnpj) {
    const digits = String((prof as any).cnpj).replace(/\D/g, "");
    if (digits.length === 11) out.documento = maskCPF(digits);
  }

  return out;
}

async function loadVehicleExtra(vehicleId: string | null | undefined) {
  if (!vehicleId) return { rntrc: "", placa_carreta1: "", placa_carreta2: "" };
  const { data } = await supabase
    .from("vehicles")
    .select("antt_number, trailer_plate_1, trailer_plate_2")
    .eq("id", vehicleId)
    .maybeSingle();
  return {
    rntrc: (data as any)?.antt_number || "",
    placa_carreta1: (data as any)?.trailer_plate_1 || "",
    placa_carreta2: (data as any)?.trailer_plate_2 || "",
  };
}

export async function buildFullContractHtml(input: ContractPrintInput): Promise<string> {
  const [contratado, motorista, vehicleExtra, cteInfo] = await Promise.all([
    loadParty(input.contratado_id, input.contratado_nome, input.contratado_documento, input.contratado_tipo),
    loadParty(input.motorista_id, input.motorista_nome, input.motorista_cpf, "PF"),
    loadVehicleExtra(input.vehicle_id),
    loadCteInfo(input.cte_id, input.cte),
  ]);

  // Proprietário do veículo: por enquanto usa o mesmo CONTRATADO (alinhado com o modelo Bsoft)
  const proprietario = contratado;

  const fmt = (v: number) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pesoTon = Number(input.peso_kg || 0) / 1000;
  const dataLocal = input.data_contrato
    ? new Date(input.data_contrato + "T12:00:00")
    : new Date();
  const dataExt = dataLocal.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const docLabel = (p: PartyDetails) => (p.tipo === "PJ" ? "Nome/CNPJ" : "Nome/CPF");
  const placasLinha = [
    input.placa_veiculo ? `Veíc.: ${input.placa_veiculo}` : "",
    vehicleExtra.placa_carreta1 ? `Carreta 1: ${vehicleExtra.placa_carreta1}` : "",
    vehicleExtra.placa_carreta2 ? `Carreta 2: ${vehicleExtra.placa_carreta2}` : "",
  ].filter(Boolean).join(" / ");

  const cteSerie = cteInfo?.serie ?? input.cte?.serie ?? null;
  const cteNumero = cteInfo?.numero ?? input.cte?.numero ?? null;
  const cteTipo = cteInfo?.tipo_talao ?? input.cte?.tipo_talao ?? null;
  const cteInterno = cteInfo?.numero_interno ?? null;
  const isServico = cteTipo === "servico";
  const cteTipoLabel = isServico ? "Serviço" : (cteTipo === "producao" ? "Produção" : "");
  const numeroExibido = isServico ? (cteInterno ?? cteNumero) : cteNumero;
  const cteLabel = numeroExibido
    ? `CT-e ${cteTipoLabel ? cteTipoLabel + " " : ""}Nº ${numeroExibido}${cteSerie ? " / Série " + cteSerie : ""}${isServico && cteInterno && cteNumero && cteInterno !== cteNumero ? " (Sefaz " + cteNumero + ")" : ""}`
    : "-";
  const cteDataEmissao = cteInfo?.data_emissao
    ? new Date(cteInfo.data_emissao).toLocaleDateString("pt-BR")
    : "-";
  const nfeKeys = (cteInfo?.chaves_nfe_ref || []).filter((k) => !!k);

  const partyBlock = (titulo: string, p: PartyDetails) => `
    <table class="party">
      <tr><th colspan="2">${titulo}</th></tr>
      <tr>
        <td style="width:70%"><b>${docLabel(p)}:</b> ${p.nome || "-"}${p.documento ? " / " + p.documento : ""}</td>
        <td><b>${p.tipo === "PJ" ? "IE" : "RG"}:</b> ${p.tipo === "PJ" ? (p.ie || "-") : (p.rg || "-")}</td>
      </tr>
      <tr>
        <td colspan="2"><b>Endereço:</b> ${p.endereco || "-"}</td>
      </tr>
      <tr>
        <td><b>Telefone:</b> ${p.telefone || "-"}</td>
        <td><b>RNTRC:</b> ${p.rntrc || vehicleExtra.rntrc || "-"}</td>
      </tr>
      ${p.email ? `<tr><td colspan="2"><b>E-mail:</b> ${p.email}</td></tr>` : ""}
    </table>
  `;

  const motoristaBlock = `
    <table class="party">
      <tr><th colspan="2">MOTORISTA</th></tr>
      <tr>
        <td style="width:70%"><b>Nome/CPF:</b> ${motorista.nome || "-"}${motorista.documento ? " / " + motorista.documento : ""}</td>
        <td><b>Hab. Nº:</b> ${motorista.cnh_numero || "-"}${motorista.cnh_categoria ? " (" + motorista.cnh_categoria + ")" : ""}</td>
      </tr>
      <tr>
        <td><b>Telefone:</b> ${motorista.telefone || "-"}</td>
        <td><b>Validade CNH:</b> ${motorista.cnh_validade || "-"}</td>
      </tr>
      <tr>
        <td colspan="2"><b>Endereço:</b> ${motorista.endereco || "-"}</td>
      </tr>
      <tr>
        <td colspan="2"><b>Placas:</b> ${placasLinha || "-"}</td>
      </tr>
    </table>
  `;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato de Frete Nº ${input.numero}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2B4C7E; padding-bottom: 6px; margin-bottom: 8px; }
  .header .empresa { font-size: 9pt; line-height: 1.3; }
  .header .empresa b { font-size: 11pt; }
  .header .num { text-align: right; font-size: 11pt; }
  .header .num b { font-size: 16pt; color: #2B4C7E; display: block; }
  h1.tit { text-align: center; font-size: 12pt; margin: 6px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  table.party { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 9pt; }
  table.party th, table.party td { border: 1px solid #999; padding: 3px 6px; text-align: left; vertical-align: top; }
  table.party th { background: #e8eef5; font-weight: bold; text-transform: uppercase; font-size: 9pt; }
  h2 { font-size: 9.5pt; margin: 10px 0 4px; text-transform: uppercase; background: #f1f1f1; padding: 3px 6px; border-left: 3px solid #2B4C7E; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; font-size: 9pt; padding: 2px 6px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 16px; font-size: 9pt; padding: 2px 6px; }
  table.carga { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 4px 0; }
  table.carga th, table.carga td { border: 1px solid #999; padding: 3px 5px; text-align: left; }
  table.carga th { background: #f1f1f1; font-size: 8pt; }
  .composicao { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 6px; font-size: 9pt; }
  .composicao .row { display: flex; justify-content: space-between; border-bottom: 1px dotted #ccc; padding: 1px 0; }
  .composicao .row.total { border-top: 1px solid #333; border-bottom: 1px solid #333; font-weight: bold; padding: 3px 0; margin-top: 4px; }
  .aviso { font-size: 8.5pt; padding: 6px 8px; background: #fffbe6; border: 1px solid #f0e68c; margin: 6px 0; text-align: justify; line-height: 1.35; }
  .obs { padding: 4px 6px; font-size: 9pt; min-height: 28px; border: 1px solid #ccc; margin-top: 4px; }
  .sign { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
  .sign .line { border-top: 1px solid #000; padding-top: 3px; text-align: center; font-size: 9pt; }
  .footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 4px; font-size: 8pt; color: #666; display: flex; justify-content: space-between; }
</style></head><body>

<div class="header">
  <div class="empresa">
    <b>SIME TRANSPORTE LTDA</b><br/>
    CNPJ: 23.662.751/0002-50<br/>
    e-mail: ct-e@simetransportes.com.br
  </div>
  <div class="num">
    Nº <b>${input.numero}</b>
  </div>
</div>

<h1 class="tit">Contrato de Afretamento</h1>

${partyBlock("CONTRATADO", contratado)}
${partyBlock("PROPRIETÁRIO / ARRENDATÁRIO", proprietario)}
${motoristaBlock}

<div class="aviso">
  O MDF-E REFERENTE A ESSE CONTRATO ${input.numero} SERÁ ENCERRADO AUTOMATICAMENTE EM 3 DIAS. SENDO ASSIM O MOTORISTA TEM A OBRIGAÇÃO DE AVISAR A TRANSPORTADORA EM CASO DE QUEBRAS E/OU FALHAS MECÂNICAS, OU QUALQUER TIPO DE IMPREVISTO QUE ACARRETE EM ATRASO DA VIAGEM, PARA QUE SEJA EMITIDO UM NOVO MDF-E. A NÃO COMUNICAÇÃO PODERÁ RESULTAR EM MULTA NO POSTO FISCAL, A QUAL SERÁ DE TOTAL RESPONSABILIDADE DO MOTORISTA.
</div>

<h2>Dados do Transporte</h2>
<div class="grid3">
  <div><b>Local Coleta:</b> ${input.municipio_origem || "-"} - ${input.uf_origem || "--"}</div>
  <div><b>Local Entrega:</b> ${input.municipio_destino || "-"} - ${input.uf_destino || "--"}</div>
  <div><b>Documento vinculado:</b> ${cteLabel}</div>
</div>

<h2>Documento Vinculado</h2>
<table class="party">
  <tr>
    <td style="width:33%"><b>CT-e:</b> ${cteLabel}</td>
    <td style="width:33%"><b>Data Emissão:</b> ${cteDataEmissao}</td>
    <td><b>Valor Frete:</b> ${cteInfo?.valor_frete != null ? fmt(Number(cteInfo.valor_frete)) : "-"}</td>
  </tr>
  <tr>
    <td colspan="2"><b>Chave CT-e:</b> ${formatChave(cteInfo?.chave_acesso)}</td>
    <td><b>Protocolo:</b> ${cteInfo?.protocolo || "-"}</td>
  </tr>
  ${nfeKeys.length > 0 ? `
  <tr>
    <th colspan="3">NF-e VINCULADAS (${nfeKeys.length})</th>
  </tr>
  ${nfeKeys.map((k, i) => `
  <tr>
    <td colspan="3" style="font-family: monospace; font-size: 8.5pt;">
      <b>${String(i + 1).padStart(2, "0")}.</b> ${formatChave(k)}
    </td>
  </tr>`).join("")}
  ` : ""}
</table>

<h2>Dados da Carga</h2>
<table class="carga">
  <tr>
    <th>Documento</th>
    <th>Natureza</th>
    <th>Peso (kg)</th>
    <th>Toneladas</th>
    <th>Valor por tonelada</th>
  </tr>
  <tr>
    <td>${cteLabel}</td>
    <td>${input.natureza_carga || "-"}</td>
    <td>${Number(input.peso_kg || 0).toLocaleString("pt-BR")}</td>
    <td>${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
    <td>${fmt(Number(input.valor_tonelada || 0))}</td>
  </tr>
</table>

<h2>Composição do Frete</h2>
<div class="composicao">
  <div>
    <div class="row"><span>Toneladas</span><span>${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} t</span></div>
    <div class="row"><span>Valor por tonelada</span><span>${fmt(Number(input.valor_tonelada || 0))}</span></div>
    <div class="row"><span>Frete bruto</span><span>${fmt(Number(input.peso_kg || 0) / 1000 * Number(input.valor_tonelada || 0))}</span></div>
  </div>
  <div>
    <div class="row"><span>(-) Descontos</span><span>${fmt(Math.max(0, (Number(input.peso_kg || 0) / 1000 * Number(input.valor_tonelada || 0)) - Number(input.valor_total || 0)))}</span></div>
    <div class="row total"><span>Líquido a pagar</span><span>${fmt(Number(input.valor_total || 0))}</span></div>
  </div>
</div>

<h2>Observações / Instruções de Transporte</h2>
<div class="obs">${(input.observacoes || "-").replace(/\n/g, "<br/>")}</div>

<div class="sign">
  <div class="line">CONTRATANTE<br/>SIME TRANSPORTE LTDA</div>
  <div class="line">CONTRATADO<br/>${contratado.nome || ""}</div>
  <div class="line">MOTORISTA<br/>${motorista.nome || ""}</div>
</div>

<div class="footer">
  <span>${dataExt}</span>
  <span>Contrato Nº ${String(input.numero).padStart(6, "0")}</span>
</div>

</body></html>`;
}

export function openPrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) w.onload = () => setTimeout(() => w.print(), 400);
}
