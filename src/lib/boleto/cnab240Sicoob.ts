// Remessa CNAB 240 do Sicoob (banco 756, layout 081 / lote 040).
// Posições reproduzem exatamente a remessa do sistema anterior (CB091001.rem).

export interface CobrancaConfig {
  banco_codigo: string;
  banco_nome: string;
  beneficiario_nome: string;
  beneficiario_cnpj: string;
  agencia: string;
  agencia_dv: string;
  conta: string;
  conta_dv: string;
  codigo_beneficiario: string;
  carteira: string;
  modalidade: string;
  especie_titulo: string;
  aceite: string;
  juros_codigo: string;
  juros_percentual: number;
  multa_codigo: string;
  multa_percentual: number;
  protesto_codigo: string;
  protesto_dias: number;
  baixa_codigo: string;
  baixa_dias: number | null;
}

export interface TituloRemessa {
  nossoNumero: number;
  nossoNumeroDv: number;
  parcela: number;
  numeroDocumento: string;
  usoEmpresa: string;
  vencimento: string; // YYYY-MM-DD
  emissao: string; // YYYY-MM-DD
  valor: number;
  pagador: {
    documento: string;
    nome: string;
    endereco: string;
    bairro: string;
    cep: string;
    cidade: string;
    uf: string;
  };
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export function num(v: unknown, len: number) {
  const d = digits(v);
  return d.length > len ? d.slice(-len) : d.padStart(len, "0");
}
export function alfa(v: unknown, len: number) {
  const t = String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ").toUpperCase();
  return t.slice(0, len).padEnd(len, " ");
}
const blank = (len: number) => " ".repeat(len);
const cents = (v: number, len: number) => num(Math.round(v * 100), len);
const dateDMY = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}${m}${y}`; };
function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** DV do nosso número Sicoob: cooperativa(4) + beneficiário(10) + nosso número(7), pesos 3197. */
export function dvNossoNumeroSicoob(agencia: string, codigoBeneficiario: string, nossoNumero: number) {
  const s = num(agencia, 4) + num(codigoBeneficiario, 10) + num(nossoNumero, 7);
  const w = "319731973197319731973";
  let t = 0;
  for (let i = 0; i < 21; i++) t += Number(s[i]) * Number(w[i]);
  const r = t % 11;
  return r <= 1 ? 0 : 11 - r;
}

function check(line: string, label: string) {
  if (line.length !== 240) throw new Error(`Linha ${label} com ${line.length} posições (esperado 240)`);
  return line;
}

/**
 * O Sicoob recusa (ocorrência 25) título com data de emissão posterior à data do movimento.
 * Faturas com emissão futura saem com a data de geração da remessa.
 */
export function emissaoTitulo(emissao: string, geradoEm: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const hoje = `${geradoEm.getFullYear()}-${p2(geradoEm.getMonth() + 1)}-${p2(geradoEm.getDate())}`;
  const e = (emissao || "").slice(0, 10);
  return !/^\d{4}-\d{2}-\d{2}$/.test(e) || e > hoje ? hoje : e;
}

export function validarTitulo(t: TituloRemessa): string[] {
  const erros: string[] = [];
  const p = t.pagador;
  const doc = digits(p.documento);
  if (doc.length !== 11 && doc.length !== 14) erros.push("CPF/CNPJ do pagador");
  if (!p.nome.trim()) erros.push("nome do pagador");
  if (!p.endereco.trim()) erros.push("endereço do pagador");
  if (digits(p.cep).length !== 8) erros.push("CEP do pagador");
  if (!p.cidade.trim()) erros.push("cidade do pagador");
  if (!/^[A-Za-z]{2}$/.test(p.uf.trim())) erros.push("UF do pagador");
  if (!(t.valor > 0)) erros.push("valor da parcela");
  if (!t.vencimento) erros.push("vencimento");
  return erros;
}

export function gerarRemessaSicoob(
  cfg: CobrancaConfig,
  titulos: TituloRemessa[],
  nsa: number,
  geradoEm: Date = new Date(),
): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dataGer = `${pad2(geradoEm.getDate())}${pad2(geradoEm.getMonth() + 1)}${geradoEm.getFullYear()}`;
  const horaGer = `${pad2(geradoEm.getHours())}${pad2(geradoEm.getMinutes())}${pad2(geradoEm.getSeconds())}`;
  const banco = num(cfg.banco_codigo, 3);
  const cnpj = digits(cfg.beneficiario_cnpj);
  const tipoInsc = cnpj.length === 11 ? "1" : "2";
  const ag = num(cfg.agencia, 5) + alfa(cfg.agencia_dv, 1);
  const ct = num(cfg.conta, 12) + alfa(cfg.conta_dv, 1);
  const lines: string[] = [];

  lines.push(check(
    banco + "0000" + "0" + blank(9) + tipoInsc + num(cnpj, 14) + blank(20) + ag + ct + "0" +
    alfa(cfg.beneficiario_nome, 30) + alfa(cfg.banco_nome, 30) + blank(10) + "1" + dataGer + horaGer +
    num(nsa, 6) + "081" + "00000" + blank(69), "header de arquivo"));

  lines.push(check(
    banco + "0001" + "1" + "R" + "01" + blank(2) + "040" + " " + tipoInsc + num(cnpj, 15) + blank(20) + ag + ct + " " +
    alfa(cfg.beneficiario_nome, 30) + blank(40) + blank(40) + num(nsa, 8) + dataGer + "00000000" + blank(33),
    "header de lote"));

  let seq = 0;
  let total = 0;
  const reg = (seg: string) => banco + "0001" + "3" + num(++seq, 5) + seg + " " + "01";
  for (const t of titulos) {
    const erros = validarTitulo(t);
    if (erros.length) throw new Error(`Documento ${t.numeroDocumento}: falta ${erros.join(", ")}`);
    total += Math.round(t.valor * 100);
    const diaSeguinte = dateDMY(addDays(t.vencimento, 1));
    const nn = num(t.nossoNumero, 9) + String(t.nossoNumeroDv) + num(t.parcela, 2) + num(cfg.modalidade, 2) + "1" + blank(5);
    lines.push(check(
      reg("P") + ag + ct + " " + nn + num(cfg.carteira, 1) + "0" + " " + "2" + "2" +
      alfa(t.numeroDocumento, 15) + dateDMY(t.vencimento) + cents(t.valor, 15) + "00000" + " " +
      num(cfg.especie_titulo, 2) + alfa(cfg.aceite, 1) + dateDMY(emissaoTitulo(t.emissao, geradoEm)) +
      alfa(cfg.juros_codigo, 1) + (Number(cfg.juros_percentual) > 0 ? diaSeguinte : "00000000") + cents(Number(cfg.juros_percentual), 15) +
      "0" + "00000000" + "0".repeat(15) + "0".repeat(15) + "0".repeat(15) +
      alfa(t.usoEmpresa, 25) +
      alfa(cfg.protesto_codigo, 1) + num(cfg.protesto_dias, 2) + alfa(cfg.baixa_codigo, 1) +
      (cfg.baixa_dias ? num(cfg.baixa_dias, 3) : blank(3)) + "09" + "0".repeat(10) + " ",
      "segmento P"));
    const p = t.pagador;
    const doc = digits(p.documento);
    lines.push(check(
      reg("Q") + (doc.length === 11 ? "1" : "2") + num(doc, 15) + alfa(p.nome, 40) + alfa(p.endereco, 40) +
      alfa(p.bairro, 15) + num(p.cep, 8) + alfa(p.cidade, 15) + alfa(p.uf, 2) + "0" + "0".repeat(15) + blank(40) +
      "000" + blank(20) + blank(8), "segmento Q"));
    lines.push(check(
      reg("R") + "0" + "00000000" + "0".repeat(15) + "0" + "00000000" + "0".repeat(15) +
      alfa(cfg.multa_codigo, 1) + (Number(cfg.multa_percentual) > 0 ? diaSeguinte : "00000000") + cents(Number(cfg.multa_percentual), 15) +
      blank(10) + blank(40) + blank(40) + blank(20) + "00000000" + "000" + "00000" + " " + "000000000000" + " " + " " + "0" + blank(9),
      "segmento R"));
    lines.push(check(reg("S") + "3" + blank(222), "segmento S"));
  }

  const qtdLote = seq + 2;
  lines.push(check(
    banco + "0001" + "5" + blank(9) + num(qtdLote, 6) + num(titulos.length, 6) + num(total, 17) +
    "000000" + "0".repeat(17) + "000000" + "0".repeat(17) + "000000" + "0".repeat(17) + blank(8) + blank(117),
    "trailer de lote"));
  lines.push(check(banco + "9999" + "9" + blank(9) + "000001" + num(qtdLote + 2, 6) + "000000" + blank(205), "trailer de arquivo"));
  return lines.join("\r\n") + "\r\n";
}

export function nomeArquivoRemessa(geradoEm: Date, seqDia: number) {
  return `CB${String(geradoEm.getDate()).padStart(2, "0")}${String(geradoEm.getMonth() + 1).padStart(2, "0")}${String(seqDia).padStart(2, "0")}.rem`;
}
