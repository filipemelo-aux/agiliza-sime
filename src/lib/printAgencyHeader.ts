import { supabase } from "@/integrations/supabase/client";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import { maskCNPJ, maskCEP, maskPhone } from "@/lib/masks";

export interface PrintAgency {
  id?: string;
  razao_social: string;
  cnpj?: string | null;
  inscricao_estadual?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_municipio?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  telefone?: string | null;
  profile_id?: string | null;
  type?: string;
}

const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Identificação do emitente no mesmo padrão do DACTE, sem geometria fiscal. */
export function buildPrintAgencyHeader(agency: PrintAgency, logo: string | null): string {
  const address = [
    [agency.endereco_logradouro, agency.endereco_numero].filter(Boolean).join(", "),
    agency.endereco_bairro ? `BAIRRO ${agency.endereco_bairro}` : "",
    [agency.endereco_municipio, agency.endereco_uf].filter(Boolean).join(" - "),
    agency.endereco_cep ? `CEP ${maskCEP(digits(agency.endereco_cep))}` : "",
    agency.telefone ? `FONE: ${maskPhone(digits(agency.telefone))}` : "",
  ].filter(Boolean).join(" - ");
  const docs = [agency.cnpj ? `CNPJ: ${maskCNPJ(digits(agency.cnpj))}` : "", agency.inscricao_estadual ? `IE: ${agency.inscricao_estadual}` : ""].filter(Boolean).join("  ·  ");
  return `<div class="print-agency-header" style="box-sizing:border-box;text-align:center;flex:1;min-width:0;padding:6px 8px;border:1px solid #111;margin-bottom:8px;break-inside:avoid;font-family:Arial,sans-serif;color:#111;line-height:1.35">
    ${logo ? `<img src="${escape(logo)}" alt="Logo da empresa" style="display:block;height:40px;max-width:120px;object-fit:contain;margin:0 auto 4px" />` : ""}
    <div style="font-size:11px;font-weight:700;overflow-wrap:anywhere">${escape(agency.razao_social.toUpperCase())}</div>
    ${address ? `<div style="font-size:8px;overflow-wrap:anywhere">${escape(address.toUpperCase())}</div>` : ""}
    ${docs ? `<div style="font-size:8px">${escape(docs)}</div>` : ""}
  </div>`;
}

export function selectPrintAgency(agencies: PrintAgency[], id?: string | null, documentCnpj?: string): PrintAgency | undefined {
  // Agência explícita nunca pode cair silenciosamente na matriz.
  if (id) return agencies.find(a => a.id === id);
  if (documentCnpj) return agencies.find(a => digits(a.cnpj) === digits(documentCnpj));
  return agencies.find(a => a.type === "matriz") || agencies[0];
}

/** Substitui só a identificação da empresa, preservando títulos e corpo A4. */
export async function standardizePrintHeaders(html: string, establishmentId?: string | null): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const { data, error } = await supabase.from("fiscal_establishments")
    .select("id, razao_social, cnpj, type, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep, profile_id");
  if (error) throw new Error("Não foi possível carregar a agência para o cabeçalho. Tente novamente.");
  const agencies: PrintAgency[] = data || [];
  const logo = await getCurrentTenantLogoUrl();
  const slots = Array.from(doc.querySelectorAll<HTMLElement>("[data-print-agency], .header, .head, table.cab .emp"));
  if (!slots.length) {
    const slot = doc.createElement("div");
    doc.body.prepend(slot);
    slots.push(slot);
  }
  const phones = new Map<string, string>();
  for (const slot of slots) {
    if (!doc.body.contains(slot)) continue;
    const cnpj = slot.textContent?.match(/CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i)?.[1];
    const id = slot.dataset.printAgency || establishmentId;
    const agency = selectPrintAgency(agencies, id, cnpj);
    if (!agency) {
      if (id || cnpj) throw new Error("A agência deste documento não foi encontrada. Confira o cadastro antes de imprimir.");
      continue;
    }
    if (agency.profile_id && !phones.has(agency.profile_id)) {
      const { data: profile } = await supabase.from("profiles").select("phone").eq("id", agency.profile_id).maybeSingle();
      phones.set(agency.profile_id, profile?.phone || "");
    }
    const header = buildPrintAgencyHeader({ ...agency, telefone: agency.profile_id ? phones.get(agency.profile_id) : undefined }, logo);
    // Alguns relatórios têm o título no mesmo bloco; mantê-lo fora do quadro do emitente.
    const metadata = Array.from(slot.children).filter(child => child.matches(".doc-info, .num") || (!!child.querySelector("h1") && !child.matches(".est, .empresa")));
    slot.replaceChildren();
    slot.insertAdjacentHTML("afterbegin", header);
    metadata.forEach(child => slot.append(child));
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}