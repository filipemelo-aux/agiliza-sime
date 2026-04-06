import { format } from "date-fns";

const formatCurrency = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export function exportQuotationPDF(q: any, establishments: any[]) {
  // Use unified company: find matriz for label + combine all CNPJs
  const matriz = establishments.find((e: any) => (e.type || e.tipo) === "matriz") || establishments[0] || q.establishment;
  const companyName = matriz?.razao_social || "Sime Transporte Ltda";
  const companyCnpjs = establishments.length > 0
    ? establishments.map((e: any) => e.cnpj).filter(Boolean).join(" / ")
    : (matriz?.cnpj || "");
  const isFrete = q.type === "frete";
  const diaria = q.valor_mensal_por_caminhao ? q.valor_mensal_por_caminhao / 30 : null;

  const logoUrl = window.location.origin + "/favicon.png";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;padding:20px 30px;color:#222;font-size:11px;line-height:1.2;max-width:800px;margin:0 auto}
  .header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #2B4C7E;padding-bottom:10px;margin-bottom:14px}
  .header img{height:40px}
  .brand{font-family:'Exo',Arial,sans-serif;font-weight:800;font-style:italic;font-size:20px;color:#2B4C7E}
  .brand span{color:#F5C518}
  .meta{display:flex;justify-content:space-between;margin-bottom:12px}
  .meta-box{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:8px 12px;flex:1;margin:0 4px}
  .meta-box h4{margin:0 0 2px;font-size:10px;color:#666;text-transform:uppercase}
  .meta-box p{margin:0;font-size:12px;font-weight:600}
  h2{font-size:13px;color:#2B4C7E;border-bottom:1px solid #e0e0e0;padding-bottom:4px;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{background:#2B4C7E;color:#fff;text-align:left;padding:5px 8px;font-size:10px}
  td{border-bottom:1px solid #e0e0e0;padding:4px 8px;font-size:11px}
  .highlight{background:#FFF8E1;font-weight:600}
  .footer{margin-top:20px;border-top:2px solid #2B4C7E;padding-top:8px;text-align:center;font-size:9px;color:#666}
  .obs{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:8px 12px;margin-top:6px;white-space:pre-wrap;font-size:11px}
</style></head><body>

<div class="header">
  <img src="${logoUrl}" alt="SIME" />
  <div>
    <div class="brand">SIME <span>TRANSPORTES</span></div>
    <div style="font-size:11px;color:#666">${companyName}</div>
    ${companyCnpjs.split(" / ").map((c: string) => `<div style="font-size:11px;color:#666">CNPJ: ${c}</div>`).join("\n    ")}
  </div>
</div>

<h1 style="text-align:center;font-size:18px;color:#2B4C7E;margin:0 0 20px">
  COTAÇÃO ${isFrete ? "DE FRETE" : "DE SERVIÇO DE COLHEITA"} Nº ${q.numero}
</h1>

<div class="meta">
  <div class="meta-box">
    <h4>Data de Emissão</h4>
    <p>${format(new Date(q.created_at), "dd/MM/yyyy")}</p>
  </div>
  <div class="meta-box">
    <h4>Validade</h4>
    <p>${q.validade_dias || 15} dias</p>
  </div>
  <div class="meta-box">
    <h4>Status</h4>
    <p>${q.status?.toUpperCase() || "RASCUNHO"}</p>
  </div>
</div>

<h2>Contratante (Cliente)</h2>
<table>
  <tr><td style="width:140px;font-weight:600">Nome / Razão Social</td><td>${q.client?.razao_social || q.client?.full_name || "—"}</td></tr>
  <tr><td style="font-weight:600">CNPJ</td><td>${q.client?.cnpj || "—"}</td></tr>
  <tr><td style="font-weight:600">Responsável pela Cotação</td><td>${q.creator?.full_name || "—"}</td></tr>
</table>

${isFrete ? `
<h2>Dados do Frete</h2>
<table>
  <tr><td style="width:140px;font-weight:600">Origem</td><td>${q.origem_cidade || ""}/${q.origem_uf || ""}</td></tr>
  <tr><td style="font-weight:600">Destino</td><td>${q.destino_cidade || ""}/${q.destino_uf || ""}</td></tr>
  <tr><td style="font-weight:600">Produto</td><td>${q.produto || "—"}</td></tr>
  <tr><td style="font-weight:600">Peso (kg)</td><td>${q.peso_kg ? Number(q.peso_kg).toLocaleString("pt-BR") : "—"}</td></tr>
  <tr class="highlight"><td style="font-weight:600">Valor do Frete</td><td>${formatCurrency(q.valor_frete)}${q.tipo_valor_frete === "por_tonelada" ? " por tonelada" : " (frete total)"}</td></tr>
</table>

<h2>Condições de Pagamento</h2>
<table>
  <tr><td style="width:200px;font-weight:600">Forma de Pagamento</td><td>${{pix:"PIX",ted:"TED",boleto:"Boleto",dinheiro:"Dinheiro",cheque:"Cheque",deposito:"Depósito"}[q.forma_pagamento_frete as string] || "—"}</td></tr>
  <tr><td style="font-weight:600">Prazo</td><td>${q.prazo_pagamento ? q.prazo_pagamento + " dias" + (q.prazo_pagamento_referencia === "emissao_cte" ? " após emissão do CT-e" : q.prazo_pagamento_referencia === "entrega" ? " após entrega" : "") : "—"}</td></tr>
  ${q.adiantamento_percentual ? `<tr><td style="font-weight:600">Adiantamento</td><td>${q.adiantamento_percentual}%</td></tr>` : ""}
  ${q.condicoes_pagamento ? `<tr><td style="font-weight:600">Observações</td><td>${q.condicoes_pagamento}</td></tr>` : ""}
</table>
` : `
<h2>Dados do Serviço de Colheita</h2>
<table>
  <tr><td style="width:200px;font-weight:600">Previsão de Início</td><td>${q.previsao_inicio ? format(new Date(q.previsao_inicio + "T12:00:00"), "dd/MM/yyyy") : "—"}</td></tr>
  <tr><td style="font-weight:600">Previsão de Término</td><td>${q.previsao_termino ? format(new Date(q.previsao_termino + "T12:00:00"), "dd/MM/yyyy") : "—"}</td></tr>
  <tr><td style="font-weight:600">Quantidade de Caminhões</td><td>${q.quantidade_caminhoes || 1}</td></tr>
  <tr class="highlight"><td style="font-weight:600">Valor Mensal por Caminhão</td><td>${formatCurrency(q.valor_mensal_por_caminhao)}</td></tr>
  <tr class="highlight"><td style="font-weight:600">Valor da Diária (automático)</td><td>${diaria ? formatCurrency(diaria) : "—"}</td></tr>
  <tr><td style="font-weight:600">Alimentação por conta de</td><td>${q.alimentacao_por_conta === "contratante" ? "CONTRATANTE (Cliente)" : "CONTRATADA (SIME)"}</td></tr>
  ${q.alimentacao_por_conta === "contratante" ? `<tr><td style="font-weight:600">Valor Alimentação/Dia</td><td>${formatCurrency(q.valor_alimentacao_dia)}</td></tr>` : ""}
  ${diaria ? `<tr class="highlight"><td style="font-weight:600">Diária Total (diária + alimentação)</td><td>${formatCurrency(diaria + (q.alimentacao_por_conta === "contratante" && q.valor_alimentacao_dia ? q.valor_alimentacao_dia : 0))}</td></tr>` : ""}
  <tr><td style="font-weight:600">Combustível por conta de</td><td>${q.combustivel_por_conta === "contratante" ? "CONTRATANTE (Cliente)" : "CONTRATADA (SIME)"}</td></tr>
</table>
`}

${q.observacoes ? `<h2>Observações</h2><div class="obs">${q.observacoes}</div>` : ""}

<div style="display:flex;justify-content:space-between;margin-top:60px;gap:40px">
  <div style="flex:1;text-align:center">
    ${q.creator?.signature_data ? `<img src="${q.creator.signature_data}" alt="Assinatura" style="max-height:60px;margin:0 auto 4px;display:block" />` : '<div style="height:60px"></div>'}
    <div style="border-top:1px solid #333;margin:0 20px;padding-top:8px">
      <p style="margin:0;font-weight:600;font-size:12px">${q.creator?.full_name || "Responsável"}</p>
      <p style="margin:2px 0 0;font-size:10px;color:#666">CONTRATADA — ${companyName}</p>
    </div>
  </div>
  <div style="flex:1;text-align:center">
    <div style="height:60px"></div>
    <div style="border-top:1px solid #333;margin:0 20px;padding-top:8px">
      <p style="margin:0;font-weight:600;font-size:12px">${q.client?.razao_social || q.client?.full_name || "Cliente"}</p>
      <p style="margin:2px 0 0;font-size:10px;color:#666">CONTRATANTE — Aprovação do Cliente</p>
    </div>
  </div>
</div>

<div class="footer">
  <p>SIME TRANSPORTES — ${companyName}</p>
  ${companyCnpjs.split(" / ").map((c: string) => `<p>CNPJ: ${c}</p>`).join("\n  ")}
  <p>Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
</div>

</body></html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
