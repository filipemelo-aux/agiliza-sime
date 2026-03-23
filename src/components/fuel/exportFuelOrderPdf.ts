import { format } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

const EMAIL_FONT_STACK = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
const EXO_FONT_URL = "https://agiliza-sime.lovable.app/fonts/exo-latin-700-normal.woff2";

function normalizeRequesterName(name?: string | null) {
  const raw = String(name || "").trim();
  if (!raw) return "Usuário";

  if (!raw.includes("@")) return raw;

  return raw
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase()) || "Usuário";
}

function buildFuelOrderHTML(order: any, establishments: any[]) {
  return buildFuelOrderHTMLWithSignature(order, establishments, null);
}

function buildFuelOrderHTMLWithSignature(order: any, establishments: any[], signatureDataUrl: string | null) {
  const est = establishments.find((e) => e.id === order.establishment_id);
  const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
  const qty = order.fill_mode === "completar" ? "Completar Tanque" : `${Number(order.liters).toLocaleString("pt-BR")} Litros`;
  const requesterName = normalizeRequesterName(order.requester_name);

  const arlaNote = order.notes?.match(/Completar Arla:\s*(Sim|Não)/i)?.[0] || "";

  const sectionTitle = (title: string) =>
    `<tr><td style="font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:0.3px;padding:0 0 8px;border-bottom:2px solid #e8ecf0">${title}</td></tr>`;

  const infoRow = (label: string, value: string, last = false) =>
    `<tr><td style="padding:10px 0;${last ? "" : "border-bottom:1px solid #f0f2f5;"}">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${EMAIL_FONT_STACK};font-size:12px;color:#666;font-weight:500;vertical-align:top;width:40%">${label}</td>
        <td style="font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:600;color:#333;text-align:right;vertical-align:top;word-break:break-word">${value}</td>
      </tr></table>
    </td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style type="text/css">
@font-face {
  font-family: 'Exo';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${EXO_FONT_URL}') format('woff2');
}
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  @page { margin: 8mm 6mm; size: A4; }
}

</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap" rel="stylesheet">
<!--[if mso]><style>table{border-collapse:collapse}*{font-family:'Segoe UI',Arial,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:${EMAIL_FONT_STACK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8">
<tr><td align="center" style="padding:10px 8px">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${EMAIL_FONT_STACK}">

<!-- HEADER -->
<tr><td style="background:#ffffff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E;margin-bottom:16px">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="width:48px;vertical-align:middle;padding-right:16px">
      <img src="${logoUrl}" alt="SIME" width="42" height="42" style="display:block;height:42px;width:42px;border-radius:6px;border:0" />
    </td>
    <td style="vertical-align:middle">
      <div style="font-family:${EMAIL_FONT_STACK};font-weight:800;font-size:18px;color:#2B4C7E;line-height:1.2;mso-line-height-rule:exactly;letter-spacing:0.3px">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
      <div style="font-size:11px;color:#666;line-height:1.4;margin-top:2px">${est?.razao_social || ""}</div>
      <div style="font-size:11px;color:#666;line-height:1.4">CNPJ: ${est?.cnpj || ""}</div>
    </td>
  </tr></table>
</td></tr>

<tr><td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- DIVIDER -->
<tr><td style="border-bottom:3px solid #2B4C7E;font-size:0;line-height:0;height:1px">&nbsp;</td></tr>

<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- TITLE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-family:${EMAIL_FONT_STACK};font-size:17px;font-weight:700;color:#2B4C7E;margin:0">ORDEM DE ABASTECIMENTO Nº ${order.order_number}</div>
</td></tr>

<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- META BOXES -->
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="48%" style="background:#f0f4f8;border:1px solid #e8ecf0;border-radius:10px;padding:14px 16px;vertical-align:top">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;font-weight:600">Data de Emissão</div>
      <div style="font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;color:#2B4C7E;margin:0">${format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</div>
    </td>
    <td width="4%" style="font-size:0">&nbsp;</td>
    <td width="48%" style="background:#f0f4f8;border:1px solid #e8ecf0;border-radius:10px;padding:14px 16px;vertical-align:top">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;font-weight:600">Status</div>
      <div style="font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;color:#2B4C7E;margin:0">${(order.status || "pendente").toUpperCase()}</div>
    </td>
  </tr></table>
</td></tr>

<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- SOLICITANTE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:12px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${sectionTitle("Solicitante")}
    ${infoRow("Empresa", `${est?.razao_social || "—"} (${est?.type === "matriz" ? "Matriz" : "Filial"})`)}
    ${infoRow("Solicitante", requesterName, true)}
  </table>
</td></tr>

<tr><td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- FORNECEDOR -->
<tr><td style="background:#ffffff;border-radius:10px;padding:12px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${sectionTitle("Fornecedor")}
    ${infoRow("Nome / Razão Social", order.supplier_name, true)}
  </table>
</td></tr>

<tr><td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- DADOS DO ABASTECIMENTO -->
<tr><td style="background:#ffffff;border-radius:10px;padding:12px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${sectionTitle("Dados do Abastecimento")}
    ${infoRow("Veículo (Placa)", order.vehicle_plate)}
    ${order.driver_name ? infoRow("Motorista", order.driver_name) : ""}
    ${infoRow("Tipo de Combustível", FUEL_LABELS[order.fuel_type] || order.fuel_type)}
    <tr><td style="padding:6px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8E1;border-radius:6px"><tr>
        <td style="padding:8px 16px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:12px;color:#666;font-weight:600;vertical-align:middle;width:40%">Quantidade</td>
            <td style="font-size:14px;font-weight:700;color:#D4930A;text-align:right;vertical-align:middle">${qty}</td>
          </tr></table>
        </td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

${order.notes ? `
<tr><td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-radius:10px;padding:12px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${sectionTitle("Observações")}
    <tr><td style="padding-top:8px">
      <div style="background:#f8f9fa;border:1px solid #e8ecf0;border-radius:8px;padding:8px 12px;white-space:pre-wrap;font-size:11px;color:#444;line-height:1.4">${order.notes}</div>
    </td></tr>
  </table>
</td></tr>` : ""}

<!-- ASSINATURAS -->
<tr><td style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="30%" style="text-align:center;padding:0 6px;vertical-align:bottom">
      ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Assinatura" style="display:block;max-height:30px;margin:0 auto 2px;width:auto" />` : `<div style="height:30px"></div>`}
      <div style="border-top:1px solid #999;margin-bottom:4px"></div>
      <span style="font-size:10px;color:#666">Solicitante</span>
    </td>
    <td width="5%">&nbsp;</td>
    <td width="30%" style="text-align:center;padding:0 6px;vertical-align:bottom">
      <div style="height:30px"></div>
      <div style="border-top:1px solid #999;margin-bottom:4px"></div>
      <span style="font-size:10px;color:#666">Fornecedor</span>
    </td>
    <td width="5%">&nbsp;</td>
    <td width="30%" style="text-align:center;padding:0 6px;vertical-align:bottom">
      <div style="height:30px"></div>
      <div style="border-top:1px solid #999;margin-bottom:4px"></div>
      <span style="font-size:10px;color:#666">Motorista</span>
    </td>
  </tr></table>
</td></tr>

<!-- FOOTER -->
<tr><td style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">SIME TRANSPORTES — ${est?.razao_social || ""} — CNPJ: ${est?.cnpj || ""}</div>
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</div>
</td></tr>

</table>

</td></tr>
</table>

</body></html>`;
}

export function exportFuelOrderPDF(order: any, establishments: any[], signatureDataUrl?: string | null) {
  return buildFuelOrderHTMLWithSignature(order, establishments, signatureDataUrl || null);
}

export async function printFuelOrderPDF(order: any, establishments: any[]) {
  let signatureDataUrl: string | null = null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("profiles")
      .select("signature_data")
      .eq("user_id", order.requester_user_id)
      .maybeSingle();
    signatureDataUrl = (data as any)?.signature_data || null;
  } catch {
    // Continue without signature
  }

  const html = buildFuelOrderHTMLWithSignature(order, establishments, signatureDataUrl);

  // Renderizar HTML em container temporário oculto
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "600px";
  container.style.background = "#f4f6f8";
  container.innerHTML = html.replace(/^<!DOCTYPE html>.*<body[^>]*>/s, "").replace(/<\/body>.*$/s, "");
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f4f6f8",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 8; // 4mm margin each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 4; // top margin

    pdf.addImage(imgData, "JPEG", 4, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 8;

    while (heightLeft > 0) {
      position = -(pageHeight - 8 - heightLeft) + 4;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 4, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 8;
    }

    pdf.save(`Ordem_Abastecimento_${order.order_number}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export function emailFuelOrder(order: any, establishments: any[]) {
  const est = establishments.find((e: any) => e.id === order.establishment_id);
  const subject = encodeURIComponent(
    `Ordem de Abastecimento Nº ${order.order_number} — ${est?.razao_social || "SIME"}`
  );
  const body = encodeURIComponent(
    `Segue a Ordem de Abastecimento Nº ${order.order_number}\n\n` +
    `Empresa: ${est?.razao_social || "—"}\n` +
    `Fornecedor: ${order.supplier_name}\n` +
    `Solicitante: ${normalizeRequesterName(order.requester_name)}\n` +
    `Veículo: ${order.vehicle_plate}\n` +
    `Combustível: ${FUEL_LABELS[order.fuel_type] || order.fuel_type}\n` +
    `Quantidade: ${order.fill_mode === "completar" ? "Completar Tanque" : `${Number(order.liters).toLocaleString("pt-BR")} Litros`}\n` +
    `Status: ${(order.status || "pendente").toUpperCase()}\n` +
    `Data: ${format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}\n\n` +
    `Observações: ${order.notes || "Nenhuma"}\n\n` +
    `---\nSIME TRANSPORTES — ${est?.razao_social || ""} — CNPJ: ${est?.cnpj || ""}`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
}
