import { format } from "date-fns";
import { downloadHtmlAsPdf, titleFromHtml } from "@/lib/pdfDownload";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

const EMAIL_FONT_STACK = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
const EXO_FONT_URL = "https://agiliza-sime.lovable.app/fonts/exo-latin-700-normal.woff2";

// Logomarca "fsm | sistemas" embutida (base64) para funcionar na impressão e no e-mail.
const FSM_LOGO_DATA_URL = "data:image/png;base64,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";

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

function buildFuelOrderHTMLWithSignature(
  order: any,
  companyName: string,
  companyCnpjs: string,
  signatureDataUrl: string | null
) {
  const logoUrl = FSM_LOGO_DATA_URL;
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
      <img src="${logoUrl}" alt="FSM | Sistemas" style="display:block;height:26px;width:auto;border:0" />
    </td>
    <td style="vertical-align:middle">
      <div style="font-family:${EMAIL_FONT_STACK};font-weight:800;font-size:18px;color:#2B4C7E;line-height:1.2;mso-line-height-rule:exactly;letter-spacing:0.3px">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
      <div style="font-size:11px;color:#666;line-height:1.4;margin-top:2px">${companyName}</div>
      ${companyCnpjs.split(" / ").map((c: string) => `<div style="font-size:11px;color:#666;line-height:1.4">CNPJ: ${c}</div>`).join("\n      ")}
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
    ${infoRow("Empresa", companyName)}
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
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">SIME TRANSPORTES — ${companyName}</div>
  ${companyCnpjs.split(" / ").map((c: string) => `<div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">CNPJ: ${c}</div>`).join("\n  ")}
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</div>
</td></tr>

</table>

</td></tr>
</table>

</body></html>`;
}

export function exportFuelOrderPDF(
  order: any,
  companyName: string,
  companyCnpjs: string,
  signatureDataUrl?: string | null
) {
  return buildFuelOrderHTMLWithSignature(order, companyName, companyCnpjs, signatureDataUrl || null);
}

export async function printFuelOrderPDF(order: any, companyName: string, companyCnpjs: string) {
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

  const html = buildFuelOrderHTMLWithSignature(order, companyName, companyCnpjs, signatureDataUrl);

  await downloadHtmlAsPdf(html, titleFromHtml(html, "Ordem de Abastecimento"));
}
