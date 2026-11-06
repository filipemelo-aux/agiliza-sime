import type { MovMotorista } from "./acertoMotoristaService";

export interface CteLink { id: string; origemId: string | null }
export interface ComissaoRef { id: string; referenciaId: string | null; origem: string; valorBase: number; percentual: number | null }

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/**
 * Junta numa só linha a comissão do CT-e principal e as dos seus saldos de frete,
 * somente quando todos estão no mesmo acerto. Saldo cujo principal está em outra quinzena fica como está.
 */
export function juntarSaldosFrete(movs: MovMotorista[], comissoes: ComissaoRef[], ctes: CteLink[]): MovMotorista[] {
  const comPorId = new Map(comissoes.map((c) => [c.id, c]));
  const comPorCte = new Map<string, ComissaoRef>();
  comissoes.forEach((c) => { if (c.origem === "cte" && c.referenciaId) comPorCte.set(c.referenciaId, c); });
  const origemDe = new Map(ctes.map((c) => [c.id, c.origemId]));
  const principalDe = new Map<string, string>(); // comissão do saldo -> comissão do principal
  comissoes.forEach((c) => {
    if (c.origem !== "cte" || !c.referenciaId) return;
    const pri = origemDe.get(c.referenciaId);
    const pc = pri ? comPorCte.get(pri) : undefined;
    if (pc && pc.id !== c.id) principalDe.set(c.id, pc.id);
  });
  if (!principalDe.size) return movs;
  const grupos = new Map<string, MovMotorista[]>();
  movs.forEach((m) => {
    if (m.natureza !== "comissao") return;
    const chave = principalDe.get(m.origemId) ?? m.origemId;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(m);
  });
  const out: MovMotorista[] = [];
  const feitos = new Set<string>();
  movs.forEach((m) => {
    if (m.natureza !== "comissao") { out.push(m); return; }
    const chave = principalDe.get(m.origemId) ?? m.origemId;
    const g = grupos.get(chave)!;
    if (g.length < 2) { out.push(m); return; }
    if (feitos.has(chave)) return;
    feitos.add(chave);
    const refs = g.map((x) => comPorId.get(x.origemId)!).filter(Boolean);
    const frete = refs.reduce((s, c) => s + Number(c.valorBase || 0), 0);
    const pcts = new Set(refs.map((c) => c.percentual));
    const pct = pcts.size === 1 ? [...pcts][0] : null;
    const principal = g.find((x) => x.origemId === chave) ?? g[0];
    out.push({
      ...principal,
      id: `cg-${chave}`,
      descricao: `Viagem (CT-e + saldo de frete) · ${pct != null ? `${String(pct).replace(".", ",")}% de ` : "frete total "}${brl(frete)}`,
      entrada: Math.round(g.reduce((s, x) => s + x.entrada, 0) * 100) / 100,
      removivel: false,
    });
  });
  return out;
}
