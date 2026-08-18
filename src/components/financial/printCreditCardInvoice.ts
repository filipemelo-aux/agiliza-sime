import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";

const CENTRO_CUSTO_LABELS: Record<string, string> = {
  frota_propria: "Frota Própria",
  frota_terceiros: "Frota Terceiros",
  administrativo: "Administrativo",
  operacional: "Operacional",
};

export async function printCreditCardInvoice(invoiceId: string) {
  const { data: inv, error } = await supabase
    .from("credit_card_invoices" as any)
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !inv) {
    toast.error("Não foi possível carregar a fatura.");
    return;
  }
  const i: any = inv;

  const { data: rows } = await supabase
    .from("credit_card_invoice_items" as any)
    .select("*, plano:plano_contas_id(codigo, nome), veiculo:veiculo_id(plate)")
    .eq("invoice_id", invoiceId)
    .order("posted_date");

  const items = (rows as any[]) || [];
  const total = items.reduce((s, r) => s + Number(r.amount || 0), 0);

  const logoUrl = window.location.origin + "/favicon.png";

  const tbody = items
    .map((r) => {
      const classified = !!(r.favorecido_id || r.plano_contas_id || (r.centro_custo && String(r.centro_custo).trim()));
      const isFrotaPropria = r.centro_custo === "frota_propria";
      const rowClass = isFrotaPropria ? "frota-propria" : classified ? "ok" : "pending";
      const planoLabel = r.plano ? `${r.plano.codigo} - ${r.plano.nome}` : "—";
      const ccLabel = r.centro_custo ? CENTRO_CUSTO_LABELS[r.centro_custo] || r.centro_custo : "—";
      const veicLabel = r.veiculo?.plate || "—";
      return `
        <tr class="${rowClass}">
          <td>${formatDateBR(r.posted_date)}</td>
          <td style="text-transform: uppercase">${escapeHtml(r.favorecido_nome || r.description || "—")}</td>
          <td style="text-transform: uppercase">${escapeHtml(r.description || "—")}</td>
          <td class="num">${formatCurrency(Number(r.amount || 0))}</td>
          <td>${escapeHtml(planoLabel)}</td>
          <td>${escapeHtml(ccLabel)}</td>
          <td>${escapeHtml(veicLabel)}</td>
        </tr>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Fatura ${escapeHtml(i.card_name || "")} - ${escapeHtml(i.reference_label || "")}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 11px; margin: 0; padding: 16px; }
  .header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #2B4C7E; padding-bottom: 8px; margin-bottom: 12px; }
  .header img { height: 36px; }
  .brand { font-family: 'Exo', Arial, sans-serif; font-weight: 800; font-style: italic; font-size: 18px; color: #2B4C7E; }
  .brand span { color: #F5C518; }
  h1 { font-size: 15px; color: #2B4C7E; margin: 0 0 10px; text-align: center; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .meta .box { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 6px 10px; }
  .meta h4 { margin: 0 0 2px; font-size: 9px; color: #666; text-transform: uppercase; }
  .meta p { margin: 0; font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #2B4C7E; color: #fff; text-align: left; padding: 5px 6px; font-size: 10px; }
  tbody td { border-bottom: 1px solid #e0e0e0; padding: 4px 6px; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.ok td { background: #DCFCE7; }
  tr.pending td { background: #FEF9C3; }
  tfoot td { padding: 8px 6px; font-weight: 700; background: #2B4C7E; color: #fff; }
  .legend { display: flex; gap: 12px; margin: 8px 0 4px; font-size: 10px; }
  .legend .sw { display: inline-block; width: 12px; height: 12px; border: 1px solid #999; margin-right: 4px; vertical-align: middle; border-radius: 2px; }
  .legend .ok { background: #DCFCE7; }
  .legend .pending { background: #FEF9C3; }
  .obs { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 10px; margin-top: 10px; white-space: pre-wrap; font-size: 11px; }
  .footer { margin-top: 14px; border-top: 2px solid #2B4C7E; padding-top: 6px; text-align: center; font-size: 9px; color: #666; }
</style></head><body>
<div class="header">
  <img src="${logoUrl}" alt="SIME" />
  <div>
    <div class="brand">SIME <span>TRANSPORTES</span></div>
    <div style="font-size:10px;color:#666">Fatura de Cartão de Crédito</div>
  </div>
</div>
<h1>FATURA — ${escapeHtml(i.card_name || "")}${i.reference_label ? " • " + escapeHtml(i.reference_label) : ""}</h1>
<div class="meta">
  <div class="box"><h4>Cartão / Banco</h4><p>${escapeHtml(i.card_name || "—")}</p></div>
  <div class="box"><h4>Referência</h4><p>${escapeHtml(i.reference_label || "—")}</p></div>
  <div class="box"><h4>Fechamento</h4><p>${i.closing_date ? formatDateBR(i.closing_date) : "—"}</p></div>
  <div class="box"><h4>Vencimento</h4><p>${i.due_date ? formatDateBR(i.due_date) : "—"}</p></div>
  <div class="box"><h4>Status</h4><p>${escapeHtml((i.status || "aberta").toUpperCase())}</p></div>
  <div class="box"><h4>Arquivo OFX</h4><p style="font-size:10px;font-weight:500">${escapeHtml(i.ofx_file_name || "—")}</p></div>
  <div class="box"><h4>Lançamentos</h4><p>${items.length}</p></div>
  <div class="box"><h4>Total da Fatura</h4><p>${formatCurrency(total)}</p></div>
</div>

<div class="legend">
  <span><span class="sw ok"></span>Classificado</span>
  <span><span class="sw pending"></span>Pendente de classificação</span>
</div>

<table>
  <thead>
    <tr>
      <th style="width:64px">Data</th>
      <th style="width:18%">Favorecido</th>
      <th>Descrição</th>
      <th style="width:90px" class="num">Valor</th>
      <th style="width:22%">Plano de Contas</th>
      <th style="width:110px">C. Custo</th>
      <th style="width:70px">Veículo</th>
    </tr>
  </thead>
  <tbody>
    ${tbody || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Nenhum lançamento.</td></tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" style="text-align:right">TOTAL</td>
      <td class="num">${formatCurrency(total)}</td>
      <td colspan="3"></td>
    </tr>
  </tfoot>
</table>

${i.observacoes ? `<div class="obs"><strong>Observações:</strong>\n${escapeHtml(i.observacoes)}</div>` : ""}

<div class="footer">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} — SIME TRANSPORTES
</div>

<script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Bloqueador de pop-ups impediu a impressão.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: any): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
