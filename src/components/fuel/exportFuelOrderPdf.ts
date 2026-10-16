import { supabase } from "@/integrations/supabase/client";
import { downloadHtmlAsPdf, titleFromHtml } from "@/lib/pdfDownload";
import { maskPlateInput } from "@/lib/masks";
import {
  buildPrintHeaderHtml,
  fetchEstablishmentHeader,
  fetchMatrizHeader,
  type PrintCompanyHeader,
} from "@/lib/printHeader";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";

// ─── Cores do padrão de impressão (modelo das faturas) ───
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";

const SECTION_TITLE = `margin:0 0 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${MUTED};padding-bottom:4px;border-bottom:1px solid ${LINE}`;
const GRID_LABEL = `display:block;font-size:10px;color:${FAINT};text-transform:uppercase;letter-spacing:0.5px`;
const GRID_VALUE = `display:block;font-size:12px;font-weight:600;color:${INK}`;

/** Título + grade de campos, no mesmo modelo usado na impressão das faturas. */
function printSection(title: string, cells: string) {
  return `<div style="margin:0 0 20px">
  <div style="${SECTION_TITLE}">${title}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
    <tr>${cells}</tr>
  </table>
</div>`;
}

/** Campo em rótulo + valor, como os itens da grade da fatura. */
function printField(label: string, value: string, width = "50%") {
  return `<td width="${width}" style="padding:6px 24px 6px 0;vertical-align:top"><div style="${GRID_LABEL}">${label}</div><div style="${GRID_VALUE}">${value || "—"}</div></td>`;
}

/** Coluna de assinatura com espaço para a rubrica acima da linha. */
function signatureColumn(label: string, imageTag: string) {
  return `<td width="33%" style="padding:0 14px;vertical-align:bottom;text-align:center">
  <div style="height:44px;display:flex;align-items:flex-end;justify-content:center">${imageTag}</div>
  <div style="border-top:1px solid ${LINE};padding-top:6px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED}">${label}</div>
</td>`;
}

export function exportFuelOrderPDF(
  order: any,
  companyName: string,
  companyCnpjs: string,
  signatureUrl?: string | null,
  logoUrl?: string | null,
  header?: PrintCompanyHeader | null
): string {
  return buildFuelOrderHTMLWithSignature(
    order,
    companyName,
    companyCnpjs,
    signatureUrl,
    logoUrl,
    header
  );
}

async function fetchSignatureUrl(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("signature_data")
    .eq("user_id", userId)
    .maybeSingle();
  const base64Data = (data as any)?.signature_data as string | null;
  if (!base64Data?.startsWith("data:image/")) return null;
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const filePath = `signatures/${userId}.png`;
    await supabase.storage
      .from("fuel-order-pdfs")
      .upload(filePath, blob, { upsert: true, contentType: "image/png" });
    const { data: urlData } = await supabase.storage
      .from("fuel-order-pdfs")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);
    return urlData?.signedUrl || null;
  } catch {
    return null;
  }
}

function getSignatureImageTag(url: string | null | undefined, height = 40) {
  if (!url) return "";
  return `<img src="${url}" alt="" style="max-height:${height}px;max-width:150px;object-fit:contain" />`;
}

export function buildFuelOrderHTML(
  order: any,
  companyName: string,
  companyCnpjs: string,
  logoUrl?: string | null,
  header?: PrintCompanyHeader | null
): string {
  return buildFuelOrderHTMLWithSignature(order, companyName, companyCnpjs, null, logoUrl, header);
}

export function buildFuelOrderHTMLWithSignature(
  order: any,
  companyName: string,
  companyCnpjs: string,
  signatureUrl?: string | null,
  logoUrl?: string | null,
  header?: PrintCompanyHeader | null
): string {
  const issuedAt = order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "—";
  const requester = order.requester_name || "—";
  const supplier = order.supplier_name || "—";
  const vehicle = order.vehicle_plate ? maskPlateInput(order.vehicle_plate) : "—";
  const driver = order.driver_name || "—";
  const fuel = order.fuel_type || "—";
  const qty = order.amount_liters ? `${order.amount_liters} L` : "Completar Tanque";
  const notes = order.notes || "";

  const hdr = header || { name: companyName, docLine: companyCnpjs, address: "" };
  const logo = logoUrl || "__TENANT_LOGO__";

  const headerHtml = buildPrintHeaderHtml({
    company: hdr,
    logoUrl: logo,
    title: `ORDEM #${order.order_number}`,
    subtitle: `${new Date(order.created_at).toLocaleDateString("pt-BR")} · ${
      order.status === "pendente" ? "Pendente" : order.status === "enviada" ? "Enviada" : order.status === "abastecida" ? "Abastecida" : "Cancelada"
    }`,
    highlight: qty,
  });

  const solicSig = signatureUrl ? getSignatureImageTag(signatureUrl) : "";
  const supplierSig = "";
  const driverSig = "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Ordem de Abastecimento #${order.order_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};background:#fff;padding:40px 48px;font-size:13px;line-height:1.5}
@media print{body{padding:0!important;font-size:12px}}
</style>
</head><body>

${headerHtml}

${printSection("Solicitação", printField("Solicitante", requester, "100%"))}

${printSection("Fornecedor", printField("Nome / Razão Social", supplier, "100%"))}

${printSection(
  "Dados do Abastecimento",
  printField("Veículo (Placa)", vehicle) +
    printField("Motorista", driver) +
    printField("Tipo de Combustível", fuel) +
    printField("Quantidade", qty)
)}

${
  notes
    ? printSection("Observações", printField("Observações", notes, "100%"))
    : ""
}

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:30px">
  <tr>
    ${signatureColumn("Solicitante", solicSig)}
    ${signatureColumn("Fornecedor", supplierSig)}
    ${signatureColumn("Motorista", driverSig)}
  </tr>
</table>

<div style="margin-top:22px;padding-top:10px;border-top:1px solid ${LINE};text-align:center;font-size:9px;color:${FAINT}">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} · ${hdr.name}
</div>

</body></html>`;
}

export async function printFuelOrderPDF(
  order: any,
  companyName: string,
  companyCnpjs: string,
  win?: Window | null
) {
  const signatureUrl = await fetchSignatureUrl(order.requester_user_id);
  let header: PrintCompanyHeader | null = null;
  let logo: string | null = null;
  try {
    header = order.establishment_id
      ? await fetchEstablishmentHeader(order.establishment_id, companyName, companyCnpjs)
      : await fetchMatrizHeader();
  } catch {
    /* usa cabeçalho textual */
  }
  try {
    logo = await getCurrentTenantLogoUrl();
  } catch {
    /* sem logo */
  }
  const html = buildFuelOrderHTMLWithSignature(
    order,
    companyName,
    companyCnpjs,
    signatureUrl,
    logo,
    header
  );
  await downloadHtmlAsPdf(html, titleFromHtml(html, "Ordem de Abastecimento"), { win });
}
