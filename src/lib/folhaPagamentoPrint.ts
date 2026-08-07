/**
 * Recibo de Pagamento de Salário no padrão universal usado pelas contabilidades
 * (layout tipo "holerite/demonstrativo de pagamento" — Portaria MTP 671/2021).
 *
 * Estrutura por colaborador:
 *   • Cabeçalho do empregador (razão social / CNPJ / endereço)
 *   • Identificação do empregado (código, nome, CPF, função, admissão, depto)
 *   • Grade de lançamentos: Cód. | Descrição | Referência | Vencimentos | Descontos
 *   • Totalizadores + Líquido a receber
 *   • Rodapé de bases: Salário base, Sal. contribuição INSS, Base FGTS,
 *     FGTS do mês, Base IRRF, Faixa IRRF
 *   • Assinatura (1ª via empregador / 2ª via empregado)
 *
 * Impressão via HTML Blob (padrão do projeto — sem bibliotecas de PDF).
 */
import { calcularINSS, calcularIRRF } from "@/services/rh/tributosFolhaService";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(n) || 0
  );

const formatDate = (d?: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatCompetencia = (mes: string) => {
  if (!mes) return "—";
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1] || m}/${y}`;
};

const maskCpfCnpj = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v || "";
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
  /** Dados cadastrais (opcionais) para completar o padrão contábil */
  codigo?: string | null;
  cpf?: string | null;
  funcao?: string | null;
  departamento?: string | null;
  admissao?: string | null;
  regime?: string | null;
  dependentes?: number;
}

export interface HoleriteEmpresa {
  nome: string;
  documento?: string | null;
  endereco?: string | null;
  cidade_uf?: string | null;
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
  empresa?: HoleriteEmpresa;
}

const EMPRESA_PADRAO: HoleriteEmpresa = { nome: "SIME TRANSPORTE LTDA" };

/** Bases legais exibidas no rodapé do holerite. */
function calcularBases(item: HoleriteItem) {
  const bruto = (Number(item.salario_base) || 0) + (Number(item.comissoes) || 0);
  const clt = (item.regime || "clt").toLowerCase() === "clt";
  if (!clt || bruto <= 0) {
    return { bruto, baseInss: 0, baseFgts: 0, fgts: 0, baseIrrf: 0, aliquotaIrrf: 0 };
  }
  const inss = calcularINSS(bruto);
  const irrf = calcularIRRF(bruto, inss, item.dependentes || 0);
  return {
    bruto,
    baseInss: bruto,
    baseFgts: bruto,
    fgts: Math.round(bruto * 0.08 * 100) / 100,
    baseIrrf: irrf.base,
    aliquotaIrrf: irrf.aliquota * 100,
  };
}

function reciboHtml(folha: HoleriteFolha, item: HoleriteItem, via: string) {
  const empresa = folha.empresa || EMPRESA_PADRAO;
  const bases = calcularBases(item);

  const proventos = [
    { cod: "0001", desc: "SALARIO BASE", ref: "30,00", venc: Number(item.salario_base) || 0 },
    ...(Number(item.comissoes) > 0
      ? [{ cod: "0050", desc: "COMISSOES / PRODUCAO", ref: "", venc: Number(item.comissoes) }]
      : []),
  ];
  const descontos = [
    ...(Number(item.adiantamentos) > 0
      ? [{ cod: "9010", desc: "ADIANTAMENTO / VALE", ref: "", val: Number(item.adiantamentos) }]
      : []),
    ...(Number(item.descontos) > 0
      ? [{ cod: "9020", desc: "DESCONTOS DO PERIODO (INSS, IRRF E OUTROS)", ref: "", val: Number(item.descontos) }]
      : []),
  ];

  const totalProventos = proventos.reduce((s, p) => s + p.venc, 0);
  const totalDescontos = descontos.reduce((s, d) => s + d.val, 0);
  const vazias = Math.max(10 - proventos.length - descontos.length, 0);

  return `
  <section class="folha">
    <table class="cab">
      <tr>
        <td class="emp">
          <div class="empresa">${esc(empresa.nome)}</div>
          <div class="sub">${empresa.documento ? `CNPJ ${esc(maskCpfCnpj(empresa.documento))}` : ""}</div>
          <div class="sub">${esc(empresa.endereco || "")} ${esc(empresa.cidade_uf || "")}</div>
        </td>
        <td class="tit">
          <div class="t1">RECIBO DE PAGAMENTO DE SALÁRIO</div>
          <div class="sub">Competência: <b>${esc(formatCompetencia(folha.mes_referencia))}</b></div>
          <div class="sub">Pagamento: <b>${esc(formatDate(folha.data_vencimento))}</b></div>
          <div class="via">${esc(via)}</div>
        </td>
      </tr>
    </table>

    <table class="ident">
      <tr>
        <td class="w8"><span>Código</span>${esc(item.codigo || "—")}</td>
        <td><span>Nome do empregado</span>${esc(item.colaborador_nome)}</td>
        <td class="w16"><span>CPF</span>${esc(maskCpfCnpj(item.cpf) || "—")}</td>
        <td class="w18"><span>Função / Cargo</span>${esc(item.funcao || "—")}</td>
        <td class="w13"><span>Admissão</span>${esc(formatDate(item.admissao))}</td>
      </tr>
      <tr>
        <td colspan="2"><span>Departamento / Setor</span>${esc(item.departamento || "—")}</td>
        <td colspan="2"><span>Período apurado</span>${esc(formatDate(folha.data_inicio))} a ${esc(formatDate(folha.data_fim))}</td>
        <td><span>Regime</span>${esc((item.regime || "CLT").toUpperCase())}</td>
      </tr>
    </table>

    <table class="lanc">
      <thead>
        <tr>
          <th class="w9">Cód.</th>
          <th>Descrição</th>
          <th class="w12 c">Referência</th>
          <th class="w16 r">Vencimentos</th>
          <th class="w16 r">Descontos</th>
        </tr>
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
        ${Array.from({ length: vazias })
          .map(() => `<tr class="vazia"><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>`)
          .join("")}
      </tbody>
    </table>

    <table class="totais">
      <tr>
        <td class="msg">Declaro ter recebido a importância líquida discriminada neste recibo.</td>
        <td class="lab">Total de vencimentos</td><td class="val">${formatBRL(totalProventos)}</td>
      </tr>
      <tr>
        <td class="msg"></td>
        <td class="lab">Total de descontos</td><td class="val">${formatBRL(totalDescontos)}</td>
      </tr>
      <tr class="liq">
        <td class="msg"></td>
        <td class="lab">Líquido a receber</td><td class="val">${formatBRL(item.liquido)}</td>
      </tr>
    </table>

    <table class="bases">
      <thead>
        <tr>
          <th>Salário base</th><th>Sal. contr. INSS</th><th>Base cálc. FGTS</th>
          <th>FGTS do mês</th><th>Base cálc. IRRF</th><th>Faixa IRRF</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${formatBRL(item.salario_base)}</td>
          <td>${formatBRL(bases.baseInss)}</td>
          <td>${formatBRL(bases.baseFgts)}</td>
          <td>${formatBRL(bases.fgts)}</td>
          <td>${formatBRL(bases.baseIrrf)}</td>
          <td>${bases.aliquotaIrrf.toFixed(1).replace(".", ",")}%</td>
        </tr>
      </tbody>
    </table>

    <table class="assinaturas">
      <tr>
        <td><div class="linha"></div>Data / Assinatura do empregado</td>
        <td><div class="linha"></div>${esc(empresa.nome)}</td>
      </tr>
    </table>
  </section>`;
}

function resumoHtml(folha: HoleriteFolha, itens: HoleriteItem[]) {
  const empresa = folha.empresa || EMPRESA_PADRAO;
  return `
  <section class="folha">
    <table class="cab">
      <tr>
        <td class="emp">
          <div class="empresa">${esc(empresa.nome)}</div>
          <div class="sub">${empresa.documento ? `CNPJ ${esc(maskCpfCnpj(empresa.documento))}` : ""}</div>
        </td>
        <td class="tit">
          <div class="t1">FOLHA DE PAGAMENTO — RESUMO GERAL</div>
          <div class="sub">Competência: <b>${esc(formatCompetencia(folha.mes_referencia))}</b></div>
          <div class="sub">Pagamento: <b>${esc(formatDate(folha.data_vencimento))}</b></div>
        </td>
      </tr>
    </table>
    <table class="lanc">
      <thead>
        <tr>
          <th class="w6 c">#</th><th>Empregado</th><th class="w16">Função</th>
          <th class="w12 r">Salário base</th><th class="w11 r">Comissões</th>
          <th class="w12 r">Adiantam.</th><th class="w11 r">Descontos</th><th class="w12 r">Líquido</th>
        </tr>
      </thead>
      <tbody>
        ${itens
          .map(
            (i, n) => `<tr>
          <td class="c">${n + 1}</td>
          <td>${esc(i.colaborador_nome)}</td>
          <td>${esc(i.funcao || "—")}</td>
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
          <td colspan="3" class="b">Totais — ${itens.length} empregado(s)</td>
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
 * Abre a janela de impressão/download (PDF via navegador) com o resumo geral da
 * folha e, para cada empregado, o recibo em duas vias (empregador e empregado).
 */
export function imprimirFolhaPagamento(folha: HoleriteFolha, itens: HoleriteItem[]) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Folha de pagamento ${esc(formatCompetencia(folha.mes_referencia))}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9.5px; margin: 0; }
  .pagina { page-break-after: always; }
  .pagina:last-child { page-break-after: auto; }
  .folha { margin-bottom: 6mm; }
  table { width: 100%; border-collapse: collapse; }
  .cab { border: 1px solid #000; }
  .cab td { padding: 6px 8px; vertical-align: top; }
  .cab .tit { text-align: right; border-left: 1px solid #000; width: 46%; }
  .empresa { font-size: 12px; font-weight: bold; text-transform: uppercase; }
  .t1 { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .sub { font-size: 8.5px; color: #222; margin-top: 1px; }
  .via { font-size: 8px; margin-top: 3px; text-transform: uppercase; letter-spacing: .5px; }
  .ident { border: 1px solid #000; border-top: 0; }
  .ident td { padding: 4px 8px; border-right: 1px solid #999; border-bottom: 1px solid #999; font-size: 9.5px; font-weight: bold; vertical-align: top; }
  .ident tr:last-child td { border-bottom: 0; }
  .ident td:last-child { border-right: 0; }
  .ident span { display: block; font-size: 7.5px; text-transform: uppercase; letter-spacing: .3px; color: #555; font-weight: normal; }
  .lanc { border: 1px solid #000; border-top: 0; }
  .lanc th { background: #eee; border-bottom: 1px solid #000; padding: 4px 8px; font-size: 8.5px; text-transform: uppercase; text-align: left; }
  .lanc td { padding: 3px 8px; border-bottom: 1px solid #ddd; }
  .lanc tfoot td { border-top: 1px solid #000; border-bottom: 0; background: #f7f7f7; }
  .totais { border: 1px solid #000; border-top: 0; }
  .totais td { padding: 3px 8px; }
  .totais .msg { font-size: 8.5px; color: #333; }
  .totais .lab { text-align: right; text-transform: uppercase; font-size: 9px; width: 26%; border-left: 1px solid #999; }
  .totais .val { text-align: right; width: 18%; font-weight: bold; }
  .totais .liq td { border-top: 1px solid #000; background: #f0f0f0; }
  .totais .liq .lab, .totais .liq .val { font-size: 11px; }
  .bases { border: 1px solid #000; border-top: 0; }
  .bases th { background: #eee; font-size: 7.5px; text-transform: uppercase; padding: 3px 6px; text-align: right; border-right: 1px solid #999; }
  .bases td { padding: 4px 6px; text-align: right; border-right: 1px solid #999; font-weight: bold; }
  .bases th:last-child, .bases td:last-child { border-right: 0; }
  .assinaturas { margin-top: 10mm; }
  .assinaturas td { width: 50%; text-align: center; font-size: 8.5px; color: #333; padding: 0 12mm; }
  .linha { border-top: 1px solid #000; margin-bottom: 3px; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .w6{width:6%} .w8{width:8%} .w9{width:9%} .w11{width:11%} .w12{width:12%}
  .w13{width:13%} .w16{width:16%} .w18{width:18%}
  .vazia td { height: 14px; }
</style></head>
<body>
<div class="pagina">${resumoHtml(folha, itens)}</div>
${itens
  .map(
    (i) => `<div class="pagina">
      ${reciboHtml(folha, i, "1ª via — Empregador")}
      ${reciboHtml(folha, i, "2ª via — Empregado")}
    </div>`
  )
  .join("")}
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

/** Gera somente os recibos dos colaboradores selecionados, sem o resumo geral. */
export function imprimirRecibosPagamento(folha: HoleriteFolha, itens: HoleriteItem[]) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Recibos ${esc(formatCompetencia(folha.mes_referencia))}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9.5px; margin: 0; }
  .pagina { page-break-after: always; }
  .pagina:last-child { page-break-after: auto; }
  .folha { margin-bottom: 6mm; }
  table { width: 100%; border-collapse: collapse; }
  .cab { border: 1px solid #000; }
  .cab td { padding: 6px 8px; vertical-align: top; }
  .cab .tit { text-align: right; border-left: 1px solid #000; width: 46%; }
  .empresa { font-size: 12px; font-weight: bold; text-transform: uppercase; }
  .t1 { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .sub { font-size: 8.5px; color: #222; margin-top: 1px; }
  .via { font-size: 8px; margin-top: 3px; text-transform: uppercase; letter-spacing: .5px; }
  .ident { border: 1px solid #000; border-top: 0; }
  .ident td { padding: 4px 8px; border-right: 1px solid #999; border-bottom: 1px solid #999; font-size: 9.5px; font-weight: bold; vertical-align: top; }
  .ident tr:last-child td { border-bottom: 0; }
  .ident td:last-child { border-right: 0; }
  .ident span { display: block; font-size: 7.5px; text-transform: uppercase; letter-spacing: .3px; color: #555; font-weight: normal; }
  .lanc { border: 1px solid #000; border-top: 0; }
  .lanc th { background: #eee; border-bottom: 1px solid #000; padding: 4px 8px; font-size: 8.5px; text-transform: uppercase; text-align: left; }
  .lanc td { padding: 3px 8px; border-bottom: 1px solid #ddd; }
  .totais { border: 1px solid #000; border-top: 0; }
  .totais td { padding: 3px 8px; }
  .totais .msg { font-size: 8.5px; color: #333; }
  .totais .lab { text-align: right; text-transform: uppercase; font-size: 9px; width: 26%; border-left: 1px solid #999; }
  .totais .val { text-align: right; width: 18%; font-weight: bold; }
  .totais .liq td { border-top: 1px solid #000; background: #f0f0f0; }
  .totais .liq .lab, .totais .liq .val { font-size: 11px; }
  .bases { border: 1px solid #000; border-top: 0; }
  .bases th { background: #eee; font-size: 7.5px; text-transform: uppercase; padding: 3px 6px; text-align: right; border-right: 1px solid #999; }
  .bases td { padding: 4px 6px; text-align: right; border-right: 1px solid #999; font-weight: bold; }
  .bases th:last-child, .bases td:last-child { border-right: 0; }
  .assinaturas { margin-top: 10mm; }
  .assinaturas td { width: 50%; text-align: center; font-size: 8.5px; color: #333; padding: 0 12mm; }
  .linha { border-top: 1px solid #000; margin-bottom: 3px; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .w8{width:8%} .w9{width:9%} .w12{width:12%} .w13{width:13%} .w16{width:16%} .w18{width:18%}
  .vazia td { height: 14px; }
</style></head><body>
${itens.map((i) => `<div class="pagina">${reciboHtml(folha, i, "1ª via — Empregador")}${reciboHtml(folha, i, "2ª via — Empregado")}</div>`).join("")}
<script>window.onload = function(){ window.focus(); window.print(); };</script>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Bloqueio de pop-up impediu a abertura dos recibos.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
