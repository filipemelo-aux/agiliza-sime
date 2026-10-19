import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { downloadHtmlAsPdf, openPrintWindow } from "@/lib/pdfDownload";
import { printHeaderMarker } from "@/lib/printHeader";

export interface ExpenseDetailData {
  expense: any;
  payments: any[];
  installments: any[];
  items: any[];
  chart: { codigo: string; nome: string } | null;
  createdByName: string | null;
}

/** Lê todos os dados reais da conta a pagar (pagamentos, parcelas, itens, conta contábil). */
export async function fetchExpenseDetail(expenseId: string): Promise<ExpenseDetailData> {
  const [exp, pays, insts, items] = await Promise.all([
    supabase.from("expenses").select("*").eq("id", expenseId).maybeSingle(),
    supabase.from("expense_payments" as any).select("*").eq("expense_id", expenseId).order("data_pagamento"),
    supabase.from("expense_installments").select("*").eq("expense_id", expenseId).order("numero_parcela"),
    supabase.from("expense_items").select("*").eq("expense_id", expenseId),
  ]);
  if (exp.error) throw exp.error;
  const expense: any = exp.data;
  if (!expense) throw new Error("Conta não encontrada");
  let chart = null;
  if (expense.plano_contas_id) {
    const { data } = await supabase.from("chart_of_accounts").select("codigo, nome").eq("id", expense.plano_contas_id).maybeSingle();
    chart = (data as any) || null;
  }
  let createdByName: string | null = null;
  if (expense.created_by) {
    const { data } = await supabase.from("profiles").select("full_name").eq("user_id", expense.created_by).maybeSingle();
    createdByName = (data as any)?.full_name || null;
  }
  return {
    expense,
    payments: ((pays.data as any[]) || []),
    installments: ((insts.data as any[]) || []),
    items: ((items.data as any[]) || []),
    chart,
    createdByName,
  };
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const STATUS: Record<string, string> = { pendente: "Pendente", pago: "Pago", atrasado: "Atrasado", parcial: "Parcial" };

export function buildExpenseDetailHtml(d: ExpenseDetailData) {
  const e = d.expense;
  const saldo = Math.max(Number(e.valor_total || 0) - Number(e.valor_pago || 0), 0);
  const row = (label: string, value: unknown) =>
    value === null || value === undefined || value === "" ? "" : `<tr><th>${label}</th><td>${esc(value)}</td></tr>`;
  const info = [
    row("Descrição", e.descricao),
    row("Favorecido", e.favorecido_nome),
    row("CNPJ/CPF fornecedor", e.fornecedor_cnpj),
    row("Conta contábil", d.chart ? `${d.chart.codigo} — ${d.chart.nome}` : null),
    row("Centro de custo", e.centro_custo),
    row("Status", STATUS[e.status] || e.status),
    row("Emissão", formatDateBR(e.data_emissao)),
    row("Competência", e.data_competencia ? formatDateBR(e.data_competencia) : null),
    row("Vencimento", e.data_vencimento ? formatDateBR(e.data_vencimento) : null),
    row("Forma de pagamento", e.forma_pagamento),
    row("Documento fiscal", e.documento_fiscal_numero),
    row("Chave NF-e", e.chave_nfe),
    row("Veículo", e.veiculo_placa),
    row("Origem", e.origem),
    row("Registrado em", e.created_at ? formatDateBR(e.created_at) : null),
    row("Registrado por", d.createdByName),
    row("Observações", e.observacoes),
  ].join("");
  const itens = d.items.length
    ? `<h3>Itens</h3><table class="g"><tr><th>Descrição</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr>${d.items
        .map((i) => `<tr><td>${esc(i.descricao)}</td><td class="r">${Number(i.quantidade || 0).toLocaleString("pt-BR")}</td><td class="r">${formatCurrency(Number(i.valor_unitario || 0))}</td><td class="r">${formatCurrency(Number(i.valor_total || 0))}</td></tr>`)
        .join("")}</table>`
    : "";
  const parcelas = d.installments.length
    ? `<h3>Parcelas</h3><table class="g"><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th><th>Status</th></tr>${d.installments
        .map((i) => `<tr><td>${i.numero_parcela}/${i.total_parcelas ?? d.installments.length}</td><td>${formatDateBR(i.data_vencimento)}</td><td class="r">${formatCurrency(Number(i.valor))}</td><td>${STATUS[i.status] || i.status}</td></tr>`)
        .join("")}</table>`
    : "";
  const pagamentos = `<h3>Pagamentos</h3>${
    d.payments.length
      ? `<table class="g"><tr><th>Data</th><th>Forma</th><th class="r">Valor</th><th class="r">Juros</th><th>Observações</th></tr>${d.payments
          .map((p) => `<tr><td>${formatDateBR(p.data_pagamento)}</td><td>${esc(p.forma_pagamento)}</td><td class="r">${formatCurrency(Number(p.valor))}</td><td class="r">${Number(p.juros || 0) ? formatCurrency(Number(p.juros)) : "—"}</td><td>${esc(p.observacoes)}</td></tr>`)
          .join("")}</table>`
      : `<p class="m">Nenhum pagamento registrado.</p>`
  }`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conta a pagar - ${esc(e.favorecido_nome || e.descricao)}</title>
<style>@page{size:A4 portrait;margin:15mm}body{font-family:Arial,sans-serif;font-size:10pt;color:#111}
h3{font-size:10.5pt;margin:14px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:4px 6px;text-align:left;vertical-align:top;word-wrap:break-word}
table.i th{width:32%;color:#555;font-weight:normal}table.i td{font-weight:bold}
table.g th{background:#f1f1f1;font-size:9pt}table.g td{border-bottom:1px solid #eee;font-size:9pt}.r{text-align:right}
.tot{display:flex;gap:10px;margin-top:10px}.tot div{flex:1;border:1px solid #ddd;padding:6px;border-radius:4px}.tot span{display:block;color:#555;font-size:8.5pt}.tot b{font-size:11pt}.m{color:#777}</style></head><body>
${printHeaderMarker({ title: "CONTA A PAGAR", subtitle: e.documento_fiscal_numero ? `Doc. ${e.documento_fiscal_numero}` : undefined, establishmentId: e.empresa_id })}
<div class="tot"><div><span>Valor total</span><b>${formatCurrency(Number(e.valor_total || 0))}</b></div><div><span>Pago</span><b>${formatCurrency(Number(e.valor_pago || 0))}</b></div><div><span>Saldo a pagar</span><b>${formatCurrency(saldo)}</b></div></div>
<h3>Dados da conta</h3><table class="i">${info}</table>${itens}${parcelas}${pagamentos}</body></html>`;
}

export async function exportExpenseDetailPdf(expenseId: string) {
  const win = openPrintWindow();
  const d = await fetchExpenseDetail(expenseId);
  const name = (d.expense.favorecido_nome || "conta").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
  await downloadHtmlAsPdf(buildExpenseDetailHtml(d), `conta_a_pagar_${name}.pdf`, { win, landscape: false });
}
