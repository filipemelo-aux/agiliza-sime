// Código de barras e linha digitável do boleto Sicoob (banco 756), padrão Febraban.
const d = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const pad = (v: unknown, n: number) => d(v).padStart(n, "0").slice(-n);

/** Fator de vencimento (base 07/10/1997; reinicia em 1000 a partir de 22/02/2025). */
export function fatorVencimento(iso: string): string {
  const base = Date.UTC(1997, 9, 7);
  const [y, m, dd] = iso.slice(0, 10).split("-").map(Number);
  let f = Math.round((Date.UTC(y, m - 1, dd) - base) / 86400000);
  while (f > 9999) f -= 9000;
  return String(f).padStart(4, "0");
}

export function mod10(s: string): number {
  let t = 0;
  let w = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    let p = Number(s[i]) * w;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    t += p;
    w = w === 2 ? 1 : 2;
  }
  return (10 - (t % 10)) % 10;
}

export function dvBarras(s43: string): number {
  let t = 0;
  let w = 2;
  for (let i = s43.length - 1; i >= 0; i--) {
    t += Number(s43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = 11 - (t % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}

export interface BoletoCampos {
  carteira: string;
  agencia: string;
  modalidade: string;
  codigoBeneficiario: string;
  nossoNumero: number;
  nossoNumeroDv: number;
  parcela: number;
  vencimento: string;
  valor: number;
}

export function campoLivreSicoob(b: BoletoCampos): string {
  return pad(b.carteira, 1) + pad(b.agencia, 4) + pad(b.modalidade, 2) + pad(b.codigoBeneficiario, 7) +
    pad(b.nossoNumero, 7) + String(b.nossoNumeroDv) + pad(b.parcela, 3);
}

export function codigoBarras(b: BoletoCampos): string {
  const livre = campoLivreSicoob(b);
  const sem = "7569" + fatorVencimento(b.vencimento) + pad(Math.round(b.valor * 100), 10) + livre;
  const dv = dvBarras(sem);
  return sem.slice(0, 4) + dv + sem.slice(4);
}

export function linhaDigitavel(barras: string): string {
  const livre = barras.slice(19);
  const c1 = barras.slice(0, 4) + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  const f = (c: string) => c + mod10(c);
  const a = f(c1), b = f(c2), c = f(c3);
  return `${a.slice(0, 5)}.${a.slice(5)} ${b.slice(0, 5)}.${b.slice(5)} ${c.slice(0, 5)}.${c.slice(5)} ${barras[4]} ${barras.slice(5, 19)}`;
}

const ITF: Record<string, string> = {
  "0": "nnwwn", "1": "wnnnw", "2": "nwnnw", "3": "wwnnn", "4": "nnwnw",
  "5": "wnwnn", "6": "nwwnn", "7": "nnnww", "8": "wnnwn", "9": "nwnwn",
};

/** Barras do Intercalado 2 de 5: lista de [larguraRelativa, preto]. */
export function barrasItf(codigo: string): [number, boolean][] {
  const out: [number, boolean][] = [[1, true], [1, false], [1, true], [1, false]];
  for (let i = 0; i < codigo.length; i += 2) {
    const a = ITF[codigo[i]], b = ITF[codigo[i + 1]];
    for (let k = 0; k < 5; k++) {
      out.push([a[k] === "w" ? 3 : 1, true]);
      out.push([b[k] === "w" ? 3 : 1, false]);
    }
  }
  out.push([3, true], [1, false], [1, true]);
  return out;
}
