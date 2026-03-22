import { format } from "date-fns";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

function buildFuelOrderHTML(order: any, establishments: any[]) {
  const est = establishments.find((e) => e.id === order.establishment_id);
  const logoUrl = window.location.origin + "/favicon.png";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:16px;color:#222;font-size:13px;max-width:800px;margin:0 auto;background:#f4f6f8}
  @media(min-width:600px){body{padding:30px 40px}}

  .header{display:flex;align-items:center;gap:16px;background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #2B4C7E;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .header img{height:42px;width:42px;border-radius:6px;flex-shrink:0}
  .brand{font-family:'Exo',Arial,sans-serif;font-weight:800;font-style:italic;font-size:20px;color:#2B4C7E;line-height:1.2}
  .brand span{color:#F5C518}
  .header-info{font-size:11px;color:#666;margin:0;line-height:1.4}

  h1{text-align:center;font-size:17px;color:#2B4C7E;margin:0 0 20px;padding:12px;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}

  .meta{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
  .meta-box{background:#fff;border:1px solid #e8ecf0;border-radius:10px;padding:14px 18px;flex:1;min-width:140px;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
  .meta-box h4{margin:0 0 6px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px}
  .meta-box p{margin:0;font-size:14px;font-weight:700;color:#2B4C7E}

  .section-card{background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .section-card h2{font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 14px;text-transform:uppercase;letter-spacing:0.3px}

  .info-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f2f5}
  .info-row:last-child{border-bottom:none}
  .info-label{font-size:12px;color:#666;font-weight:500}
  .info-value{font-size:13px;font-weight:600;color:#333;text-align:right}
  .info-highlight{background:#FFF8E1;margin:0 -20px;padding:10px 20px;border-radius:6px}
  .info-highlight .info-value{color:#D4930A;font-size:14px}

  .obs-card{background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .obs-card h2{font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.3px}
  .obs-text{background:#f8f9fa;border:1px solid #e8ecf0;border-radius:8px;padding:12px 16px;white-space:pre-wrap;font-size:12px;color:#444;line-height:1.5}

  .signature{margin-top:40px;display:flex;justify-content:space-around;flex-wrap:wrap;gap:20px}
  .sig-line{text-align:center;min-width:160px;flex:1}
  .sig-line hr{border:none;border-top:1px solid #999;margin-bottom:6px}
  .sig-line span{font-size:11px;color:#666}

  .footer{margin-top:30px;background:#2B4C7E;border-radius:10px;padding:14px 20px;text-align:center;font-size:10px;color:rgba(255,255,255,0.85)}
  .footer p{margin:2px 0}

  @media(max-width:480px){
    .meta{flex-direction:column}
    .signature{flex-direction:column;align-items:center}
    .sig-line{width:80%}
    h1{font-size:15px}
  }
</style></head><body>

<div class="header">
  <img src="${logoUrl}" alt="SIME" width="42" height="42" style="height:42px;width:42px;max-height:42px;border-radius:6px" />
  <div style="display:flex;flex-direction:column;gap:3px">
    <div class="brand" style="font-family:'Exo',Arial,sans-serif;font-weight:800;font-style:italic;font-size:20px;color:#2B4C7E;line-height:1.2">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
    <div class="header-info" style="font-size:11px;color:#666;margin:0;line-height:1.4">${est?.razao_social || ""}</div>
    <div class="header-info" style="font-size:11px;color:#666;margin:0;line-height:1.4">CNPJ: ${est?.cnpj || ""}</div>
  </div>
</div>

<h1 style="text-align:center;font-size:17px;color:#2B4C7E;margin:0 0 20px;padding:12px;background:#fff;border-radius:10px">ORDEM DE ABASTECIMENTO Nº ${order.order_number}</h1>

<div class="meta" style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
  <div class="meta-box" style="background:#fff;border:1px solid #e8ecf0;border-radius:10px;padding:14px 18px;flex:1;min-width:140px">
    <h4 style="margin:0 0 6px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Data de Emissão</h4>
    <p style="margin:0;font-size:14px;font-weight:700;color:#2B4C7E">${format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</p>
  </div>
  <div class="meta-box" style="background:#fff;border:1px solid #e8ecf0;border-radius:10px;padding:14px 18px;flex:1;min-width:140px">
    <h4 style="margin:0 0 6px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Status</h4>
    <p style="margin:0;font-size:14px;font-weight:700;color:#2B4C7E">${(order.status || "pendente").toUpperCase()}</p>
  </div>
</div>

<div class="section-card" style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px">
  <h2 style="font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 14px;text-transform:uppercase">Solicitante</h2>
  <div class="info-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f2f5">
    <span class="info-label" style="font-size:12px;color:#666">Empresa</span>
    <span class="info-value" style="font-size:13px;font-weight:600;color:#333">${est?.razao_social || "—"} (${est?.type === "matriz" ? "Matriz" : "Filial"})</span>
  </div>
  <div class="info-row" style="display:flex;justify-content:space-between;padding:8px 0">
    <span class="info-label" style="font-size:12px;color:#666">Solicitante</span>
    <span class="info-value" style="font-size:13px;font-weight:600;color:#333">${order.requester_name}</span>
  </div>
</div>

<div class="section-card" style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px">
  <h2 style="font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 14px;text-transform:uppercase">Fornecedor</h2>
  <div class="info-row" style="display:flex;justify-content:space-between;padding:8px 0">
    <span class="info-label" style="font-size:12px;color:#666">Nome / Razão Social</span>
    <span class="info-value" style="font-size:13px;font-weight:600;color:#333">${order.supplier_name}</span>
  </div>
</div>

<div class="section-card" style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px">
  <h2 style="font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 14px;text-transform:uppercase">Dados do Abastecimento</h2>
  <div class="info-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f2f5">
    <span class="info-label" style="font-size:12px;color:#666">Veículo (Placa)</span>
    <span class="info-value" style="font-size:13px;font-weight:600;color:#333">${order.vehicle_plate}</span>
  </div>
  <div class="info-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f2f5">
    <span class="info-label" style="font-size:12px;color:#666">Tipo de Combustível</span>
    <span class="info-value" style="font-size:13px;font-weight:600;color:#333">${FUEL_LABELS[order.fuel_type] || order.fuel_type}</span>
  </div>
  <div class="info-row info-highlight" style="display:flex;justify-content:space-between;padding:10px 20px;background:#FFF8E1;border-radius:6px;margin:4px -20px 0;padding-left:20px;padding-right:20px">
    <span class="info-label" style="font-size:12px;color:#666;font-weight:600">Quantidade</span>
    <span class="info-value" style="font-size:14px;font-weight:700;color:#D4930A">${order.fill_mode === "completar" ? "Completar Tanque" : `${Number(order.liters).toLocaleString("pt-BR")} Litros`}</span>
  </div>
</div>

${order.notes ? `<div class="obs-card" style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:16px">
  <h2 style="font-size:14px;color:#2B4C7E;border-bottom:2px solid #e8ecf0;padding-bottom:8px;margin:0 0 12px;text-transform:uppercase">Observações</h2>
  <div class="obs-text" style="background:#f8f9fa;border:1px solid #e8ecf0;border-radius:8px;padding:12px 16px;white-space:pre-wrap;font-size:12px;color:#444">${order.notes}</div>
</div>` : ""}

<div class="signature" style="margin-top:40px;display:flex;justify-content:space-around;flex-wrap:wrap;gap:20px">
  <div class="sig-line" style="text-align:center;min-width:160px;flex:1"><hr style="border:none;border-top:1px solid #999;margin-bottom:6px"/><span style="font-size:11px;color:#666">Solicitante</span></div>
  <div class="sig-line" style="text-align:center;min-width:160px;flex:1"><hr style="border:none;border-top:1px solid #999;margin-bottom:6px"/><span style="font-size:11px;color:#666">Fornecedor</span></div>
  <div class="sig-line" style="text-align:center;min-width:160px;flex:1"><hr style="border:none;border-top:1px solid #999;margin-bottom:6px"/><span style="font-size:11px;color:#666">Motorista</span></div>
</div>

<div class="footer" style="margin-top:30px;background:#2B4C7E;border-radius:10px;padding:14px 20px;text-align:center;font-size:10px;color:rgba(255,255,255,0.85)">
  <p style="margin:2px 0">SIME TRANSPORTES — ${est?.razao_social || ""} — CNPJ: ${est?.cnpj || ""}</p>
  <p style="margin:2px 0">Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
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
