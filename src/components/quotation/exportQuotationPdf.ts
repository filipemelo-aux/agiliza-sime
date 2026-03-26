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
  body{font-family:Arial,sans-serif;padding:30px 40px;color:#222;font-size:12px;max-width:800px;margin:0 auto}
  .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2B4C7E;padding-bottom:16px;margin-bottom:24px}
  .header img{height:50px}
  .brand{font-family:'Exo',Arial,sans-serif;font-weight:800;font-style:italic;font-size:22px;color:#2B4C7E}
  .brand span{color:#F5C518}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px}
  .meta-box{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;flex:1;margin:0 4px}
  .meta-box h4{margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase}
  .meta-box p{margin:0;font-size:13px;font-weight:600}
  h2{font-size:16px;color:#2B4C7E;border-bottom:1px solid #e0e0e0;padding-bottom:6px;margin:24px 0 12px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#2B4C7E;color:#fff;text-align:left;padding:8px 10px;font-size:11px}
  td{border-bottom:1px solid #e0e0e0;padding:8px 10px;font-size:12px}
  .highlight{background:#FFF8E1;font-weight:600}
  .footer{margin-top:40px;border-top:2px solid #2B4C7E;padding-top:12px;text-align:center;font-size:10px;color:#666}
  .obs{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-top:12px;white-space:pre-wrap;font-size:12px}
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
  <tr class="highlight"><td style="font-weight:600">Valor do Frete</td><td>${formatCurrency(q.valor_frete)}</td></tr>
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
