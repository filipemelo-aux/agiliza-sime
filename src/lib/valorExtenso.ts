// Conversão de valor numérico para extenso (pt-BR, Real)

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function tresDigitosExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (d === 1) {
    partes.push(DEZ_A_DEZENOVE[u]);
  } else {
    if (d > 1) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(UNIDADES[u]);
  }
  return partes.join(" e ");
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: { valor: number; singular: string; plural: string }[] = [
    { valor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
    { valor: 1_000_000, singular: "milhão", plural: "milhões" },
    { valor: 1_000, singular: "mil", plural: "mil" },
  ];

  const partes: string[] = [];
  let restante = n;

  for (const g of grupos) {
    const q = Math.floor(restante / g.valor);
    if (q > 0) {
      const nome = g.valor === 1000 ? "mil" : q === 1 ? g.singular : g.plural;
      const prefixo = g.valor === 1000 && q === 1 ? "" : `${tresDigitosExtenso(q)} `;
      partes.push(`${prefixo}${nome}`.trim());
      restante = restante % g.valor;
    }
  }

  if (restante > 0) partes.push(tresDigitosExtenso(restante));

  if (partes.length > 1) {
    const ultima = partes[partes.length - 1];
    const anteriores = partes.slice(0, -1).join(", ");
    // "e" antes da última parte quando < 100 ou múltiplo de 100
    const numFinal = restante;
    const usaE = numFinal > 0 && (numFinal < 100 || numFinal % 100 === 0);
    return usaE ? `${anteriores} e ${ultima}` : `${anteriores} ${ultima}`;
  }
  return partes[0] || "zero";
}

/** Converte um valor em reais para extenso. Ex: 1234.56 -> "um mil, duzentos e trinta e quatro reais e cinquenta e seis centavos" */
export function valorPorExtenso(valor: number): string {
  const v = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(v / 100);
  const centavos = v % 100;

  const partes: string[] = [];
  if (reais > 0) {
    partes.push(`${inteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

/** Quebra o extenso em duas linhas respeitando um limite de caracteres por linha. */
export function quebrarExtenso(texto: string, maxChars = 60): [string, string] {
  if (texto.length <= maxChars) return [texto, ""];
  const corte = texto.lastIndexOf(" ", maxChars);
  const idx = corte > 0 ? corte : maxChars;
  return [texto.slice(0, idx).trim(), texto.slice(idx).trim()];
}
