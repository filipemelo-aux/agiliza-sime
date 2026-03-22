import { format } from "date-fns";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

function buildFuelOrderHTML(order: any, establishments: any[]) {
  const est = establishments.find((e) => e.id === order.establishment_id);
  const logoUrl = window.location.origin + "/favicon.png";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;padding:30px 40px;color:#222;font-size:12px;max-width:800px;margin:0 auto}
  .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2B4C7E;padding-bottom:16px;margin-bottom:24px}
  .header img{height:50px}
  .brand{font-family:'Exo',Arial,sans-serif;font-weight:800;font-style:italic;font-size:22px;color:#2B4C7E}
  .brand span{color:#F5C518}
  h1{text-align:center;font-size:18px;color:#2B4C7E;margin:0 0 20px}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px}
  .meta-box{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;flex:1;margin:0 4px}
  .meta-box h4{margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase}
  .meta-box p{margin:0;font-size:13px;font-weight:600}
  h2{font-size:16px;color:#2B4C7E;border-bottom:1px solid #e0e0e0;padding-bottom:6px;margin:24px 0 12px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  td{border-bottom:1px solid #e0e0e0;padding:8px 10px;font-size:12px}
  .label{width:180px;font-weight:600;color:#444}
  .highlight{background:#FFF8E1;font-weight:600}
  .obs{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-top:12px;white-space:pre-wrap;font-size:12px}
  .signature{margin-top:60px;display:flex;justify-content:space-around}
  .sig-line{text-align:center;width:200px}
  .sig-line hr{border:none;border-top:1px solid #333;margin-bottom:4px}
  .sig-line span{font-size:11px;color:#666}
  .footer{margin-top:40px;border-top:2px solid #2B4C7E;padding-top:12px;text-align:center;font-size:10px;color:#666}
</style></head><body>

<div class="header">
  <img src="${logoUrl}" alt="SIME" />
  <div>
    <div class="brand">SIME <span>TRANSPORTES</span></div>
    <div style="font-size:11px;color:#666">${est?.razao_social || ""} — CNPJ: ${est?.cnpj || ""}</div>
  </div>
</div>

<h1>ORDEM DE ABASTECIMENTO Nº ${order.order_number}</h1>

<div class="meta">
  <div class="meta-box">
    <h4>Data de Emissão</h4>
    <p>${format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</p>
  </div>
  <div class="meta-box">
    <h4>Status</h4>
    <p>${(order.status || "pendente").toUpperCase()}</p>
  </div>
</div>

<h2>Solicitante</h2>
<table>
  <tr><td class="label">Empresa</td><td>${est?.razao_social || "—"} (${est?.type === "matriz" ? "Matriz" : "Filial"})</td></tr>
  <tr><td class="label">Solicitante</td><td>${order.requester_name}</td></tr>
</table>

<h2>Fornecedor</h2>
<table>
  <tr><td class="label">Nome / Razão Social</td><td>${order.supplier_name}</td></tr>
</table>

<h2>Dados do Abastecimento</h2>
<table>
  <tr><td class="label">Veículo (Placa)</td><td>${order.vehicle_plate}</td></tr>
  <tr><td class="label">Tipo de Combustível</td><td>${FUEL_LABELS[order.fuel_type] || order.fuel_type}</td></tr>
  <tr class="highlight"><td class="label">Quantidade</td><td>${order.fill_mode === "completar" ? "Completar Tanque" : `${Number(order.liters).toLocaleString("pt-BR")} Litros`}</td></tr>
</table>

${order.notes ? `<h2>Observações</h2><div class="obs">${order.notes}</div>` : ""}

<div class="signature">
  <div class="sig-line"><hr/><span>Solicitante</span></div>
  <div class="sig-line"><hr/><span>Fornecedor</span></div>
  <div class="sig-line"><hr/><span>Motorista</span></div>
</div>

<div class="footer">
  <p>SIME TRANSPORTES — ${est?.razao_social || ""} — CNPJ: ${est?.cnpj || ""}</p>
  <p>Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
</div>

</body></html>`;
}

export function exportFuelOrderPDF(order: any, establishments: any[]) {
  return buildFuelOrderHTML(order, establishments);
}

export function printFuelOrderPDF(order: any, establishments: any[]) {
  const html = buildFuelOrderHTML(order, establishments);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
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
