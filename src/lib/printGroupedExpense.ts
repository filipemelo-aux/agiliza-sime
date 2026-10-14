import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { downloadHtmlAsPdf, titleFromHtml } from "@/lib/pdfDownload";

/** Descobre quais contas são agrupamentos (grupo de contas ou fatura de abastecimentos). */
export async function fetchGroupedExpenseIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  const [g, f] = await Promise.all([
    supabase.from("expense_group_items" as any).select("grupo_expense_id").in("grupo_expense_id", ids),
    supabase.from("fuelings" as any).select("expense_id").in("expense_id", ids).is("deleted_at", null),
  ]);
  ((g.data as any[]) || []).forEach(r => out.add(r.grupo_expense_id));
  ((f.data as any[]) || []).forEach(r => out.add(r.expense_id));
  return out;
}

export async function printGroupedExpenseDetails(expenseId: string) {
  // Abre a aba ainda dentro do clique; senão o navegador bloqueia o pop-up após as consultas.
  const win = window.open("", "_blank");
  if (!win) { toast.error("Permita a abertura da janela de impressão no navegador."); return; }
  win.document.write('<p style="font-family:Arial;padding:20px">Carregando detalhes...</p>');
  const fail = (msg: string) => { try { win.close(); } catch {} toast.error(msg); };
  const { data: expense, error: expErr } = await supabase.from("expenses")
    .select("id, descricao, favorecido_nome, data_vencimento, valor_total, plano_contas_id").eq("id", expenseId).maybeSingle();
  if (expErr || !expense) return fail(expErr?.message || "Conta não encontrada.");

    const { data: links, error } = await supabase
      .from("expense_group_items" as any)
      .select("original_expense_id, valor")
      .eq("grupo_expense_id", expense.id);
    if (error) return fail(error.message);
    const ids = ((links as any[]) || []).map(l => l.original_expense_id).filter(Boolean);

    const { data: originalsPre } = ids.length ? await supabase.from("expenses").select("plano_contas_id").in("id", ids) : { data: [] as any[] };
    const chartIds = Array.from(new Set([expense.plano_contas_id, ...((originalsPre as any[]) || []).map(o => o.plano_contas_id)].filter(Boolean)));
    const chartIdMap: Record<string, { codigo: string; nome: string }> = {};
    if (chartIds.length) {
      const { data: charts } = await supabase.from("chart_of_accounts").select("id, codigo, nome").in("id", chartIds as string[]);
      ((charts as any[]) || []).forEach(c => { chartIdMap[c.id] = c; });
    }

    let rows: { favorecido: string; descricao: string; data: string; placa: string; litros: number | null; valor: number; planoContas: string }[] = [];

    if (ids.length > 0) {
      const { data: originals } = await supabase
        .from("expenses")
        .select("id, descricao, favorecido_nome, data_emissao, data_vencimento, valor_total, documento_fiscal_numero, veiculo_placa, litros, plano_contas_id")
        .in("id", ids);

      rows = ((originals as any[]) || []).map(o => {
        const chart = o.plano_contas_id ? chartIdMap[o.plano_contas_id] : null;
        return {
          favorecido: o.favorecido_nome || "Sem favorecido",
          descricao: o.documento_fiscal_numero ? `NF ${o.documento_fiscal_numero} — ${o.descricao}` : (o.descricao || "—"),
          data: o.data_vencimento || o.data_emissao,
          placa: o.veiculo_placa || "—",
          litros: o.litros != null ? Number(o.litros) : null,
          valor: Number(o.valor_total) || 0,
          planoContas: chart ? `${chart.codigo} ${chart.nome}` : "",
        };
      });
    } else {
      // Faturas de abastecimento agrupadas: itens vêm dos abastecimentos vinculados
      const { data: fuelings } = await supabase
        .from("fuelings" as any)
        .select("id, data_abastecimento, posto_combustivel, tipo_combustivel, quantidade_litros, valor_total, veiculo_id, vehicles:veiculo_id(plate)")
        .eq("expense_id", expense.id)
        .is("deleted_at", null);

      rows = ((fuelings as any[]) || []).map(f => ({
        favorecido: f.posto_combustivel || expense.favorecido_nome || "—",
        descricao: `Abastecimento${f.tipo_combustivel ? ` — ${f.tipo_combustivel}` : ""}`,
        data: f.data_abastecimento,
        placa: f.vehicles?.plate || "—",
        litros: f.quantidade_litros != null ? Number(f.quantidade_litros) : null,
        valor: Number(f.valor_total) || 0,
        planoContas: "",
      }));
    }

    if (rows.length === 0) return fail("Esta conta não possui itens agrupados.");
    rows = rows.sort((a, b) => a.data.localeCompare(b.data));

    const total = rows.reduce((s, r) => s + r.valor, 0);
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const chartGroup = expense.plano_contas_id ? chartIdMap[expense.plano_contas_id] : null;

    const rowsHtml = rows.map((r) => `<tr>
      <td class="nowrap">${esc(formatDateBR(r.data))}</td>
      <td>${esc(r.favorecido)}</td>
      <td>${esc(r.descricao)}</td>
      <td class="placa">${esc(r.placa)}</td>
      <td class="r">${r.litros != null ? esc(r.litros.toLocaleString("pt-BR", { maximumFractionDigits: 2 })) : "—"}</td>
      <td>${esc(r.planoContas)}</td>
      <td class="r">${esc(formatCurrency(r.valor))}</td>
    </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Detalhes da Conta</title>
<style>
*{box-sizing:border-box}
@page { margin: 10mm 8mm; size: A4 portrait; }
html,body{margin:0;padding:0;background:#fff;font-family:Arial,'Segoe UI',system-ui,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 12px;display:flex;gap:8px;justify-content:flex-end;position:sticky;top:0;z-index:10}
.toolbar button{font-family:inherit;font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid #d1d5db;background:#2B4C7E;color:#fff;cursor:pointer}
.wrap{padding:4px;background:#fff;width:100%;max-width:100%}
.head{display:flex;align-items:center;gap:10px;padding:2px 2px 4px;border-bottom:1.5px solid #2B4C7E;margin-bottom:4px}
.head h1{margin:0;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:8px;color:#666;text-align:right;margin-top:2px}
.meta{display:flex;gap:14px;flex-wrap:wrap;font-size:8pt;color:#374151;background:#f4f7fb;border:1px solid #d0d7de;border-radius:4px;padding:5px 8px;margin-bottom:6px}
.meta b{color:#1f2937}
table{width:100%;border-collapse:collapse;font-size:7pt;background:#fff;border:1px solid #d0d7de;table-layout:fixed}
thead th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:6.5pt;letter-spacing:.2px;padding:3px;border:1px solid #d0d7de;text-align:left;word-wrap:break-word;overflow-wrap:anywhere}
tbody td{padding:2px 3px;border:1px solid #e5e7eb;font-size:7pt;line-height:1.15;word-wrap:break-word;overflow-wrap:anywhere;vertical-align:top}
tbody tr:nth-child(even) td{background:#fafbfc}
.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}
.nowrap{white-space:nowrap;overflow-wrap:normal;font-size:6.5pt}
.placa{white-space:nowrap;overflow-wrap:normal;font-size:7pt;letter-spacing:.1px}
tfoot td{background:#eef2f6;border-top:1.5px solid #2B4C7E}
tr{page-break-inside:avoid}
thead{display:table-header-group}
tfoot{display:table-row-group}
.foot{margin-top:4px;display:flex;justify-content:space-between;font-size:7pt;color:#6b7280}
.totals-labels{padding:4px 6px}
.totals-row{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-wrap:wrap}
.total-item{font-size:7.5pt;color:#4b5563}
.total-item b{font-size:8pt;color:#1f2937;font-weight:800}
.grand-total{font-size:9pt;font-weight:800;color:#2B4C7E;background:#e5ebf2;padding:4px 5px;text-align:right;white-space:nowrap}
@media print { .no-print{display:none!important} .toolbar{display:none!important} }
</style></head>
<body>
<div class="toolbar no-print"></div>
<div class="wrap">
  <div class="head">
    <div style="flex:1"><h1>Detalhes da Conta</h1><div class="per">${rows.length} item(ns) agrupado(s)</div></div>
  </div>
  <div class="meta">
    <span>Favorecido: <b>${esc(expense.favorecido_nome || "—")}</b></span>
    <span>Descrição: <b>${esc(expense.descricao || "—")}</b></span>
    <span>Vencimento: <b>${esc(expense.data_vencimento ? formatDateBR(expense.data_vencimento) : "—")}</b></span>
    <span>Plano de Contas: <b>${esc(chartGroup ? `${chartGroup.codigo} ${chartGroup.nome}` : "—")}</b></span>
    <span>Valor Total: <b>${esc(formatCurrency(Number(expense.valor_total) || 0))}</b></span>
  </div>
  <table>
    <colgroup>
      <col style="width:9%" />
      <col style="width:19%" />
      <col style="width:26%" />
      <col style="width:10%" />
      <col style="width:8%" />
      <col style="width:16%" />
      <col style="width:12%" />
    </colgroup>
    <thead><tr>
      <th>Data</th><th>Favorecido</th><th>Descrição</th><th>Placa</th><th class="r">Litros</th><th>Plano de Contas</th><th class="r">Valor</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="totals-labels">
          <div class="totals-row">
            <span class="total-item">Itens: <b>${rows.length}</b></span>
            <span class="total-item"><b>TOTAL DOS ITENS</b></span>
          </div>
        </td>
        <td class="grand-total">${esc(formatCurrency(total))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="foot"><div>SIME TRANSPORTES</div><div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div></div>
</div>
<script>
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(function () { window.focus(); window.print(); }, 400);
      });
    });
  });
</script>
</body></html>`;

    downloadHtmlAsPdf(html, titleFromHtml(html, "Detalhes da Conta"), { win });
  }
