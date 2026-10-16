// Cabeçalho padrão das impressões (exceto DACTE/DAMDFE/cheques):
// logo + razão social + CNPJ/IE + endereço à esquerda; título do documento à direita.
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ } from "@/lib/masks";

export interface PrintCompanyHeader {
  name: string;
  docLine: string;
  address: string;
}

/** Busca os dados da agência (matriz/filial) para o cabeçalho. */
export async function fetchEstablishmentHeader(estId: string | null | undefined, fallbackName = "", fallbackCnpj = ""): Promise<PrintCompanyHeader> {
  const base: PrintCompanyHeader = { name: fallbackName, docLine: fallbackCnpj ? `CNPJ: ${fallbackCnpj}` : "", address: "" };
  if (!estId) return base;
  const { data: e } = await (supabase.from as any)("fiscal_establishments")
    .select("razao_social, cnpj, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep")
    .eq("id", estId).maybeSingle();
  if (!e) return base;
  let docLine = `CNPJ: ${maskCNPJ(e.cnpj || "")}`;
  if (e.inscricao_estadual) docLine += ` · IE: ${e.inscricao_estadual}`;
  const line1 = [e.endereco_logradouro, e.endereco_numero ? `nº ${e.endereco_numero}` : null, e.endereco_bairro].filter(Boolean).join(", ");
  const line2 = [e.endereco_municipio && e.endereco_uf ? `${e.endereco_municipio}/${e.endereco_uf}` : null, e.endereco_cep ? `CEP: ${e.endereco_cep}` : null].filter(Boolean).join(" · ");
  return { name: e.razao_social || fallbackName, docLine, address: [line1, line2].filter(Boolean).join(" — ") };
}

/** HTML do cabeçalho padrão (estilos inline, funciona em impressão e e-mail). */
export function buildPrintHeaderHtml(opts: {
  company: PrintCompanyHeader;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  highlight?: string;
}) {
  const { company, logoUrl, title, subtitle, highlight } = opts;
  const F = "Arial,Helvetica,sans-serif";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:2px solid #111;margin-bottom:14px;font-family:${F}"><tr>
  ${logoUrl ? `<td style="width:1%;vertical-align:middle;padding:0 14px 12px 0"><img src="${logoUrl}" alt="Logo da empresa" style="display:block;max-height:56px;max-width:110px;width:auto;border:0" /></td>` : ""}
  <td style="vertical-align:middle;padding-bottom:12px">
    <div style="font-size:16px;font-weight:800;color:#111;text-transform:uppercase">${company.name}</div>
    ${company.docLine ? `<div style="font-size:11px;color:#444;margin-top:5px">${company.docLine}</div>` : ""}
    ${company.address ? `<div style="font-size:10px;color:#777;margin-top:3px;text-transform:uppercase;line-height:1.4">${company.address}</div>` : ""}
  </td>
  <td style="vertical-align:middle;text-align:right;padding:0 0 12px 12px;white-space:nowrap">
    <div style="font-size:19px;font-weight:800;color:#111">${title}</div>
    ${subtitle ? `<div style="font-family:'Courier New',monospace;font-size:10px;color:#555;margin-top:5px">${subtitle}</div>` : ""}
    ${highlight ? `<div style="font-size:13px;font-weight:700;color:#111;margin-top:4px">${highlight}</div>` : ""}
  </td>
</tr></table>`;
}
