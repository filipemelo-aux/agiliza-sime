import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { barrasItf, codigoBarras, linhaDigitavel } from "./boletoSicoob";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fmtDoc = (v: string) => {
  const s = digits(v);
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
};

/**
 * Gera o PDF com os boletos já registrados (com nosso número) das parcelas em aberto da fatura.
 * Retorna null quando a fatura não tem boleto gerado.
 */
export async function buildBoletosFaturaPdf(faturaId: string, base?: jsPDF): Promise<jsPDF | null> {
  const { data: fatura, error: fErr } = await supabase
    .from("faturas_recebimento").select("id, numero, cliente_id, created_at").eq("id", faturaId).maybeSingle();
  if (fErr) throw fErr;
  if (!fatura) return null;
  const { data: contas, error: cErr } = await supabase
    .from("contas_receber").select("id, data_vencimento, valor, valor_recebido, status")
    .eq("fatura_id", faturaId).order("data_vencimento");
  if (cErr) throw cErr;
  if (!contas?.length) return null;
  const { data: titulos, error: tErr } = await supabase
    .from("boleto_titulos").select("conta_receber_id, config_id, nosso_numero, nosso_numero_dv")
    .in("conta_receber_id", contas.map((c) => c.id));
  if (tErr) throw tErr;
  const abertos = contas.filter((c) => c.status !== "recebido" && titulos?.some((t) => t.conta_receber_id === c.id));
  if (!abertos.length) return null;

  const cfgIds = [...new Set(titulos!.map((t) => t.config_id))];
  const [{ data: cfgs, error: gErr }, { data: cli }] = await Promise.all([
    supabase.from("cobranca_configs").select("*").in("id", cfgIds),
    supabase.from("profiles").select("full_name, razao_social, cnpj, address_street, address_number, address_neighborhood, address_city, address_state, address_zip").eq("id", fatura.cliente_id).maybeSingle(),
  ]);
  if (gErr) throw gErr;

  const pdf = base ?? new jsPDF({ unit: "mm", format: "a4" });
  const emissao = new Date(fatura.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const pagadorNome = cli?.razao_social || cli?.full_name || "";
  const pagadorEnd = [
    [cli?.address_street, cli?.address_number].filter(Boolean).join(", "),
    cli?.address_neighborhood, `${cli?.address_city ?? ""}/${cli?.address_state ?? ""}`,
    cli?.address_zip ? `CEP ${digits(cli.address_zip).replace(/(\d{5})(\d{3})/, "$1-$2")}` : "",
  ].filter(Boolean).join(" - ");

  // Altura total do boleto (recibo + ficha + código de barras), em mm.
  const BOLETO_H = 149;
  abertos.forEach((c, i) => {
    // 1º boleto cabe abaixo da fatura? Então fica na mesma página, encostado no rodapé.
    const bottom = Number((pdf as any).__contentBottomMm ?? Infinity);
    const startCompact = i === 0 && !!base && bottom + 6 + BOLETO_H <= 291;
    if (!startCompact && (i > 0 || base)) pdf.addPage("a4", "p");
    const top = startCompact ? 291 - BOLETO_H : 12;
    const t = titulos!.find((x) => x.conta_receber_id === c.id)!;
    const cfg = cfgs!.find((x) => x.id === t.config_id)!;
    const parcela = contas.findIndex((p) => p.id === c.id) + 1;
    const valor = Math.round((Number(c.valor) - Number(c.valor_recebido ?? 0)) * 100) / 100;
    const barras = codigoBarras({
      carteira: cfg.carteira, agencia: cfg.agencia, modalidade: cfg.modalidade, codigoBeneficiario: cfg.codigo_beneficiario,
      nossoNumero: Number(t.nosso_numero), nossoNumeroDv: Number(t.nosso_numero_dv), parcela, vencimento: c.data_vencimento, valor,
    });
    const linha = linhaDigitavel(barras);
    const nn = `${String(t.nosso_numero).padStart(7, "0")}-${t.nosso_numero_dv}`;
    const agCod = `${cfg.agencia}/${cfg.codigo_beneficiario}`;
    const instrucoes = [
      Number(cfg.juros_percentual) > 0 ? `Após o vencimento, juros de ${String(cfg.juros_percentual).replace(".", ",")}% ao mês.` : "",
      Number(cfg.multa_percentual) > 0 ? `Após o vencimento, multa de ${String(cfg.multa_percentual).replace(".", ",")}%.` : "",
      cfg.protesto_dias ? `Sujeito a protesto após ${cfg.protesto_dias} dias do vencimento.` : "",
      `Referente à fatura Nº ${fatura.numero}${abertos.length > 1 || contas.length > 1 ? ` - parcela ${parcela}/${contas.length}` : ""}.`,
    ].filter(Boolean);

    const L = 10, W = 190;
    const cell = (x: number, y: number, w: number, h: number, label: string, value: string, opts?: { bold?: boolean; right?: boolean }) => {
      pdf.setDrawColor(0); pdf.setLineWidth(0.2); pdf.rect(x, y, w, h);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(6); pdf.text(label, x + 1, y + 2.5);
      pdf.setFont("helvetica", opts?.bold ? "bold" : "normal"); pdf.setFontSize(8.5);
      const v = pdf.splitTextToSize(value, w - 2)[0] ?? "";
      if (opts?.right) pdf.text(v, x + w - 1, y + h - 1.5, { align: "right" }); else pdf.text(v, x + 1, y + h - 1.5);
    };
    const header = (y: number, right: string) => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text("SICOOB", L, y + 6);
      pdf.setLineWidth(0.5); pdf.line(L + 30, y + 1, L + 30, y + 8); pdf.line(L + 48, y + 1, L + 48, y + 8);
      pdf.setFontSize(13); pdf.text("756-0", L + 33, y + 6);
      pdf.setFontSize(right === linha ? 10.5 : 9); pdf.text(right, L + W, y + 6, { align: "right" });
      pdf.setLineWidth(0.5); pdf.line(L, y + 8, L + W, y + 8);
    };

    // Recibo do pagador
    let y = top;
    if (startCompact) {
      pdf.setLineDashPattern([1, 1], 0); pdf.setLineWidth(0.2); pdf.line(L, y - 3, L + W, y - 3); pdf.setLineDashPattern([], 0);
    }
    header(y, "Recibo do Pagador");
    y += 9;
    cell(L, y, 110, 8, "Beneficiário", `${cfg.beneficiario_nome} - CNPJ ${fmtDoc(cfg.beneficiario_cnpj)}`);
    cell(L + 110, y, 40, 8, "Agência/Código do Beneficiário", agCod);
    cell(L + 150, y, 40, 8, "Vencimento", formatDateBR(c.data_vencimento), { bold: true, right: true });
    y += 8;
    cell(L, y, 110, 8, "Pagador", `${pagadorNome} - ${fmtDoc(cli?.cnpj ?? "")}`);
    cell(L + 110, y, 40, 8, "Nosso Número", nn);
    cell(L + 150, y, 40, 8, "Valor do Documento", formatCurrency(valor), { bold: true, right: true });
    y += 8;
    cell(L, y, 50, 8, "Número do Documento", String(fatura.numero));
    cell(L + 50, y, 60, 8, "Data do Documento", formatDateBR(emissao));
    cell(L + 110, y, 80, 8, "Autenticação mecânica", "");
    y += 10;
    pdf.setLineDashPattern([1, 1], 0); pdf.line(L, y, L + W, y); pdf.setLineDashPattern([], 0);
    pdf.setFontSize(6); pdf.setFont("helvetica", "normal"); pdf.text("Corte na linha pontilhada", L + W, y - 1, { align: "right" });

    // Ficha de compensação
    y += 4;
    header(y, linha);
    y += 9;
    const R = 45, LW = W - R;
    cell(L, y, LW, 8, "Local de Pagamento", "Pagável em qualquer banco até o vencimento.");
    cell(L + LW, y, R, 8, "Vencimento", formatDateBR(c.data_vencimento), { bold: true, right: true });
    y += 8;
    cell(L, y, LW, 8, "Beneficiário", `${cfg.beneficiario_nome} - CNPJ ${fmtDoc(cfg.beneficiario_cnpj)}`);
    cell(L + LW, y, R, 8, "Agência/Código do Beneficiário", agCod, { right: true });
    y += 8;
    cell(L, y, 28, 8, "Data do Documento", formatDateBR(emissao));
    cell(L + 28, y, 35, 8, "Nº do Documento", String(fatura.numero));
    cell(L + 63, y, 22, 8, "Espécie Doc.", cfg.especie_titulo === "04" ? "DS" : "DM");
    cell(L + 85, y, 15, 8, "Aceite", cfg.aceite);
    cell(L + 100, y, LW - 100, 8, "Data Processamento", formatDateBR(emissao));
    cell(L + LW, y, R, 8, "Nosso Número", nn, { right: true });
    y += 8;
    cell(L, y, 28, 8, "Uso do Banco", "");
    cell(L + 28, y, 20, 8, "Carteira", cfg.carteira);
    cell(L + 48, y, 15, 8, "Espécie", "R$");
    cell(L + 63, y, 37, 8, "Quantidade", "");
    cell(L + 100, y, LW - 100, 8, "Valor", "");
    cell(L + LW, y, R, 8, "(=) Valor do Documento", formatCurrency(valor), { bold: true, right: true });
    y += 8;
    pdf.rect(L, y, LW, 30);
    pdf.setFontSize(6); pdf.text("Instruções (texto de responsabilidade do beneficiário)", L + 1, y + 2.5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); instrucoes.forEach((s, k) => pdf.text(s, L + 1, y + 6.5 + k * 4));
    ["(-) Desconto/Abatimento", "(-) Outras Deduções", "(+) Mora/Multa", "(+) Outros Acréscimos", "(=) Valor Cobrado"]
      .forEach((lb, k) => cell(L + LW, y + k * 6, R, 6, lb, ""));
    y += 30;
    pdf.rect(L, y, W, 13);
    pdf.setFontSize(6); pdf.text("Pagador", L + 1, y + 2.5);
    pdf.setFontSize(8.5);
    pdf.text(`${pagadorNome} - ${fmtDoc(cli?.cnpj ?? "")}`, L + 12, y + 3);
    pdf.text(pdf.splitTextToSize(pagadorEnd, W - 14).slice(0, 2), L + 12, y + 7);
    y += 13;
    pdf.setFontSize(6); pdf.text("Autenticação mecânica - Ficha de Compensação", L + W, y + 3, { align: "right" });

    // Código de barras ITF (largura fina 0,33 mm, altura 13 mm)
    const bars = barrasItf(barras);
    const narrow = 0.33;
    let x = L;
    pdf.setFillColor(0, 0, 0);
    for (const [w, black] of bars) {
      if (black) pdf.rect(x, y + 5, w * narrow, 13, "F");
      x += w * narrow;
    }
  });
  return pdf;
}
