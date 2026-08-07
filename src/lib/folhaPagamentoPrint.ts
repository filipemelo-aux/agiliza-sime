/**
 * Geração do recibo de pagamento (holerite) em formato padrão universal.
 * Impressão via HTML Blob (padrão do projeto — sem bibliotecas de PDF).
 */

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const formatDate = (d?: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const formatCompetencia = (mes: string) => {
  if (!mes) return "—";
  const [y, m] = mes.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] || m}/${y}`;
};

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export interface HoleriteItem {
  colaborador_nome: string;
  salario_base: number;
  comissoes: number;
  adiantamentos: number;
  descontos: number;
  liquido: number;
}

export interface HoleriteFolha {
  mes_referencia: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  data_vencimento: string;
  tipo_periodo?: string;
  status?: string;
  total_base: number;
  total_comissoes: number;
  total_adiantamentos: number;
  total_descontos: number;
  total_liquido: number;
}

const EMPRESA = {
  nome: "SIME TRANSPORTE LTDA",
  documento: "",
};

function reciboHtml(folha: HoleriteFolha, item: HoleriteItem) {
  const proventos = [
    { cod: "001", desc: "Salário base", ref: "30,00", venc: Number(item.salario_base) || 0 },
    ...(Number(item.comissoes) > 0
      ? [{ cod: "050", desc: "Comissões / Produção", ref: "—", venc: Number(item.comissoes) }]
      : []),
  ];
  const descontos = [
    ...(Number(item.adiantamentos) > 0
      ? [{ cod: "100", desc: "Adiantamentos / Vales", ref: "—", val: Number(item.adiantamentos) }]
      : []),
    ...(Number(item.descontos) > 0
      ? [{ cod: "110", desc: "Descontos do período (INSS, IRRF e outros)", ref: "—", val: Number(item.descontos) }]
      : []),
  ];
  const totalProventos = proventos.reduce((s, p) => s + p.venc, 0);
  const totalDescontos = descontos.reduce((s, d) => s + d.val, 0);

  const linhas = Math.max(proventos.length + descontos.length, 6);
  const vazias = linhas - proventos.length - descontos.length;

  return `
  <section class="folha">
    <header class="cab">
      <div>
        <div class="empresa">${esc(EMPRESA.nome)}</div>
        ${EMPRESA.documento ? `<div class="sub">CNPJ ${esc(EMPRESA.documento)}</div>` : ""}
      </div>
      <div class="titulo">
        RECIBO DE PAGAMENTO DE SALÁRIO
        <div class="sub">Competência ${esc(formatCompetencia(folha.mes_referencia))}</div>
      </div>
    </header>

    <table class="ident">
      <tr>
        <td><span>Colaborador</span>${esc(item.colaborador_nome)}</td>
        <td class="w25"><span>Período</span>${esc(formatDate(folha.data_inicio))} a ${esc(formatDate(folha.data_fim))}</td>
        <td class="w20"><span>Pagamento</span>${esc(formatDate(folha.data_vencimento))}</td>
      </tr>
    </table>

    <table class="lanc">
      <thead>
        <tr><th class="w10">Cód.</th><th>Descrição</th><th class="w12">Referência</th><th class="w16">Vencimentos</th><th class="w16">Descontos</th></tr>
      </thead>
      <tbody>
        ${proventos
          .map(
            (p) =>
              `<tr><td>${p.cod}</td><td>${esc(p.desc)}</td><td class="c">${p.ref}</td><td class="r">${formatBRL(p.venc)}</td><td></td></tr>`
          )
          .join("")}
        ${descontos
          .map(
            (d) =>
              `<tr><td>${d.cod}</td><td>${esc(d.desc)}</td><td class="c">${d.ref}</td><td></td><td class="r">${formatBRL(d.val)}</td></tr>`
          )
          .join("")}
        ${Array.from({ length: Math.max(vazias, 0) })
          .map(() => `<tr class="vazia"><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>`)
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="r b">Totais</td>
          <td class="r b">${formatBRL(totalProventos)}</td>
          <td class="r b">${formatBRL(totalDescontos)}</td>
        </tr>
      </tfoot>
    </table>

    <table class="liquido">
      <tr>
        <td class="obs">Declaro ter recebido a importância líquida discriminada neste recibo.</td>
        <td class="lab">Líquido a receber</td>
        <td class="val">${formatBRL(item.liquido)}</td>
      </tr>
    </table>

    <div class="assinaturas">
      <div class="ass"><div class="linha"></div>Assinatura do colaborador</div>
      <div class="ass"><div class="linha"></div>${esc(EMPRESA.nome)}</div>
    </div>
  </section>`;
}

function resumoHtml(folha: HoleriteFolha, itens: HoleriteItem[]) {
  return `
  <section class="folha resumo">
    <header class="cab">
      <div>
        <div class="empresa">${esc(EMPRESA.nome)}</div>
      </div>
      <div class="titulo">
        FOLHA DE PAGAMENTO — RESUMO
        <div class="sub">Competência ${esc(formatCompetencia(folha.mes_referencia))} · Pagamento ${esc(formatDate(folha.data_vencimento))}</div>
      </div>
    </header>
    <table class="lanc">
      <thead>
        <tr>
          <th>Colaborador</th><th class="w14">Salário base</th><th class="w14">Comissões</th>
          <th class="w14">Adiantamentos</th><th class="w14">Descontos</th><th class="w14">Líquido</th>
        </tr>
      </thead>
      <tbody>
        ${itens
          .map(
            (i) => `<tr>
          <td>${esc(i.colaborador_nome)}</td>
          <td class="r">${formatBRL(i.salario_base)}</td>
          <td class="r">${formatBRL(i.comissoes)}</td>
          <td class="r">${formatBRL(i.adiantamentos)}</td>
          <td class="r">${formatBRL(i.descontos)}</td>
          <td class="r b">${formatBRL(i.liquido)}</td>
        </tr>`
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td class="b">Totais (${itens.length})</td>
          <td class="r b">${formatBRL(folha.total_base)}</td>
          <td class="r b">${formatBRL(folha.total_comissoes)}</td>
          <td class="r b">${formatBRL(folha.total_adiantamentos)}</td>
          <td class="r b">${formatBRL(folha.total_descontos)}</td>
          <td class="r b">${formatBRL(folha.total_liquido)}</td>
        </tr>
      </tfoot>
    </table>
  </section>`;
}

/**
 * Abre a janela de impressão/download (PDF via navegador) com o resumo da folha
 * e um recibo de pagamento por colaborador.
 */
export function imprimirFolhaPagamento(folha: HoleriteFolha, itens: HoleriteItem[]) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Folha de pagamento ${esc(formatCompetencia(folha.mes_referencia))}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
  .folha { page-break-after: always; padding-bottom: 8mm; }
  .folha:last-child { page-break-after: auto; }
  .cab { display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #333; padding: 8px 10px; }
  .empresa { font-size: 13px; font-weight: bold; }
  .titulo { text-align: right; font-size: 12px; font-weight: bold; }
  .sub { font-weight: normal; font-size: 10px; color: #444; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  .ident { border: 1px solid #333; border-top: 0; }
  .ident td { padding: 6px 10px; border-right: 1px solid #ccc; font-size: 11px; font-weight: bold; vertical-align: top; }
  .ident td:last-child { border-right: 0; }
  .ident span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .4px; color: #666; font-weight: normal; }
  .lanc { border: 1px solid #333; border-top: 0; margin-top: 0; }
  .lanc th { background: #f0f0f0; border-bottom: 1px solid #333; padding: 5px 8px; font-size: 9.5px; text-transform: uppercase; text-align: left; }
  .lanc td { padding: 4px 8px; border-bottom: 1px solid #e3e3e3; }
  .lanc tfoot td { border-top: 1px solid #333; border-bottom: 0; background: #fafafa; }
  .liquido { border: 1px solid #333; border-top: 0; }
  .liquido td { padding: 8px 10px; }
  .liquido .obs { font-size: 9.5px; color: #555; }
  .liquido .lab { text-align: right; text-transform: uppercase; font-size: 10px; font-weight: bold; width: 26%; }
  .liquido .val { text-align: right; font-size: 14px; font-weight: bold; width: 20%; }
  .assinaturas { display: flex; gap: 40px; margin-top: 22mm; }
  .ass { flex: 1; text-align: center; font-size: 9.5px; color: #444; }
  .linha { border-top: 1px solid #333; margin-bottom: 4px; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .w10 { width: 10%; } .w12 { width: 12%; } .w14 { width: 14%; } .w16 { width: 16%; } .w20 { width: 20%; } .w25 { width: 25%; }
  .vazia td { height: 16px; }
</style></head>
<body>
${resumoHtml(folha, itens)}
${itens.map((i) => reciboHtml(folha, i)).join("")}
<script>window.onload = function(){ window.focus(); window.print(); };</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Bloqueio de pop-up impediu a abertura do documento.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
