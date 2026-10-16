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
  const FUEL_LABELS: Record<string, string> = { gasolina: "Gasolina", diesel: "Diesel", diesel_s10: "Diesel S10", arla: "Arla 32", etanol: "Etanol" };
  const STATUS: Record<string, [string, string, string]> = {
    pendente: ["Pendente", "#fef3c7", "#92400e"],
    enviada: ["Enviada", "#dbeafe", "#1e40af"],
    abastecida: ["Abastecida", "#dcfce7", "#166534"],
    cancelada: ["Cancelada", "#f3f4f6", "#4b5563"],
  };
  const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
  const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
  const fmtDoc = (d?: string | null) => {
    const n = String(d || "").replace(/\D/g, "");
    if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return d || "—";
  };

  const requester = esc(order.requester_name || "—");
  const supplier = esc((order.supplier_name || "—").replace(/\s*[-–]\s*$/, ""));
  const sup = order.supplier_info || {};
  const veh = order.vehicle_info || {};
  const vehicle = order.vehicle_plate ? maskPlateInput(order.vehicle_plate) : "—";
  const driver = esc(order.driver_name || "—");
  const fuel = FUEL_LABELS[order.fuel_type] || (order.fuel_type || "—").replace(/_/g, " ");
  const liters = order.amount_liters ?? order.liters;
  const isFull = !liters || order.fill_mode === "completar";
  const qty = isFull ? "Completar tanque" : `${Number(liters).toLocaleString("pt-BR")} L`;
  const notes = esc(order.notes || "");
  const [stLabel, stBg, stFg] = STATUS[order.status] || STATUS.pendente;
  const supAddr = [sup.address_street, sup.address_number, sup.address_neighborhood, sup.address_city && `${sup.address_city}${sup.address_state ? "/" + sup.address_state : ""}`]
    .filter(Boolean).join(", ");
  const vehDesc = [veh.brand, veh.model, veh.year].filter(Boolean).join(" ") || "—";

  const hdr = header || { name: companyName, docLine: companyCnpjs, address: "" };
  const logo = logoUrl || "__TENANT_LOGO__";

  const headerHtml = buildPrintHeaderHtml({
    company: hdr,
    logoUrl: logo,
    title: `ORDEM #${order.order_number}`,
    subtitle: `Emitida em ${fmtDate(order.created_at)} · ${stLabel}`,
    highlight: qty,
  });

  const solicSig = signatureUrl ? getSignatureImageTag(signatureUrl) : "";

  const summaryItem = (label: string, value: string) =>
    `<td style="text-align:center;padding:4px 6px"><div style="font-size:14px;font-weight:800;color:${INK}">${value}</div><div style="font-size:9px;color:${MUTED};text-transform:uppercase;letter-spacing:0.3px">${label}</div></td>`;

  const th = (t: string, align = "left") =>
    `<th style="background:#f8f9fa;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;color:${MUTED};padding:5px 6px;text-align:${align};border-bottom:2px solid ${LINE}">${t}</th>`;
  const td = (t: string, extra = "") => `<td style="padding:6px;font-size:11px;border-bottom:1px solid #f3f4f6;${extra}">${t}</td>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Ordem de Abastecimento #${order.order_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:${INK};background:#fff;padding:40px 48px;font-size:13px;line-height:1.5}
@media print{body{padding:0!important;font-size:12px}@page{margin:10mm;size:A4 portrait}}
</style>
</head><body>

${headerHtml}

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:1px solid ${LINE};border-radius:8px;margin:0 0 20px;border-collapse:separate">
  <tr>
    ${summaryItem("Veículo", `<span style="white-space:nowrap">${vehicle}</span>`)}
    ${summaryItem("Combustível", fuel)}
    ${summaryItem("Quantidade", qty)}
    ${summaryItem("Status", `<span style="display:inline-block;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;background:${stBg};color:${stFg}">${stLabel}</span>`)}
  </tr>
</table>

${printSection(
  "Solicitação",
  printField("Solicitante", requester, "34%") +
    printField("Data / hora da emissão", fmtDateTime(order.created_at), "33%") +
    printField("Agência", esc(hdr.name), "33%")
)}

${printSection(
  "Fornecedor / Posto",
  printField("Nome / Razão Social", supplier + (sup.nome_fantasia ? `<div style="font-size:10px;font-weight:400;color:${MUTED}">${esc(sup.nome_fantasia)}</div>` : ""), "50%") +
    printField("CNPJ / CPF", fmtDoc(sup.cnpj || sup.cpf), "25%") +
    printField("Telefone", esc(sup.phone || "—"), "25%")
)}
${supAddr ? `<div style="margin:-14px 0 20px;font-size:10px;color:${MUTED}"><span style="color:${FAINT};text-transform:uppercase;letter-spacing:0.5px">Endereço:</span> ${esc(supAddr)}</div>` : ""}

<div style="margin:0 0 20px">
  <div style="${SECTION_TITLE}">Itens do Abastecimento</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
    <thead><tr>${th("Placa")}${th("Veículo")}${th("Motorista")}${th("Combustível")}${th("Modo")}${th("Quantidade", "right")}</tr></thead>
    <tbody><tr>
      ${td(`<b style="white-space:nowrap;font-family:'SF Mono',Monaco,monospace">${vehicle}</b>`)}
      ${td(esc(vehDesc))}
      ${td(driver)}
      ${td(fuel)}
      ${td(isFull ? "Tanque cheio" : "Litros definidos")}
      ${td(`<b>${qty}</b>`, "text-align:right")}
    </tr>
    <tr style="background:#f0fdf4"><td colspan="5" style="padding:6px;font-size:11px;font-weight:700;color:#15803d;border-bottom:2px solid #16a34a">TOTAL AUTORIZADO</td><td style="padding:6px;font-size:11px;font-weight:700;color:#15803d;text-align:right;border-bottom:2px solid #16a34a">${qty}</td></tr>
    </tbody>
  </table>
</div>

${
  notes
    ? `<div style="margin:0 0 20px">
  <div style="${SECTION_TITLE}">Observações</div>
  <div style="font-size:12px;color:${INK};white-space:pre-wrap;background:#f8f9fa;border-left:3px solid ${INK};padding:8px 10px;border-radius:4px">${notes}</div>
</div>`
    : ""
}

<div style="margin:0 0 20px;padding:8px 10px;border:1px dashed ${LINE};border-radius:6px;font-size:10px;color:${MUTED}">
  Autorizamos o fornecimento descrito acima ao veículo e motorista identificados. Abastecimento válido somente com a apresentação desta ordem; o comprovante deve informar o nº da ordem (#${order.order_number}), a placa e a quantidade abastecida.
  ${order.email_sent_at ? `<br/>Ordem enviada ao fornecedor em ${fmtDateTime(order.email_sent_at)}${order.email_sent_to ? ` para ${esc(order.email_sent_to)}` : ""}.` : ""}
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:30px">
  <tr>
    ${signatureColumn("Solicitante", solicSig)}
    ${signatureColumn("Fornecedor", "")}
    ${signatureColumn("Motorista", "")}
  </tr>
</table>

<div style="margin-top:22px;padding-top:10px;border-top:1px solid ${LINE};text-align:center;font-size:9px;color:${FAINT}">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} · ${esc(hdr.name)}
</div>

</body></html>`;
}

/** Busca dados complementares de fornecedor e veículo para a impressão. */
export async function enrichFuelOrder(order: any): Promise<any> {
  const out = { ...order };
  try {
    if (order.supplier_id && !order.supplier_info) {
      const { data } = await supabase
        .from("profiles")
        .select("cnpj, nome_fantasia, phone, address_street, address_number, address_neighborhood, address_city, address_state")
        .eq("id", order.supplier_id)
        .maybeSingle();
      if (data) out.supplier_info = data;
    }
    if (order.vehicle_id && !order.vehicle_info) {
      const { data } = await supabase.from("vehicles").select("brand, model, year").eq("id", order.vehicle_id).maybeSingle();
      if (data) out.vehicle_info = data;
    }
  } catch {
    /* segue sem dados extras */
  }
  return out;
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
    await enrichFuelOrder(order),
    companyName,
    companyCnpjs,
    signatureUrl,
    logo,
    header
  );
  await downloadHtmlAsPdf(html, titleFromHtml(html, "Ordem de Abastecimento"), { win });
}
