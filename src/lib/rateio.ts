import { supabase } from "@/integrations/supabase/client";

export interface RateioRow {
  id?: string;
  veiculo_id: string | null;
  valor_rateado: number;
  percentual?: number | null;
}

export type RateioParent = { expense_id: string } | { card_item_id: string };

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);

/** Soma dos valores rateados */
export const sumRateio = (rows: RateioRow[]) =>
  rows.reduce((s, r) => s + (Number(r.valor_rateado) || 0), 0);

/** Valida se o rateio fecha exatamente com o valor total (tolerância de 1 centavo) */
export function validateRateio(rows: RateioRow[], valorTotal: number): string | null {
  const valid = rows.filter((r) => r.veiculo_id);
  if (valid.length === 0) return "Adicione ao menos um veículo no rateio.";
  if (valid.some((r) => !(Number(r.valor_rateado) > 0)))
    return "Todos os veículos do rateio precisam ter valor maior que zero.";
  const ids = valid.map((r) => r.veiculo_id);
  if (new Set(ids).size !== ids.length) return "Há veículos repetidos no rateio.";
  const diff = Math.abs(centavos(sumRateio(valid)) - centavos(valorTotal));
  if (diff > 1) {
    return `A soma do rateio (${sumRateio(valid).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) precisa ser igual ao valor total (${Number(valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`;
  }
  return null;
}

/** Distribui o valor total igualmente entre as linhas, ajustando centavos na última */
export function distribuirIgualmente(rows: RateioRow[], valorTotal: number): RateioRow[] {
  const n = rows.length;
  if (!n) return rows;
  const totalCents = centavos(valorTotal);
  const base = Math.floor(totalCents / n);
  return rows.map((r, i) => {
    const cents = i === n - 1 ? totalCents - base * (n - 1) : base;
    return { ...r, valor_rateado: cents / 100, percentual: valorTotal ? (cents / 100 / valorTotal) * 100 : null };
  });
}

export async function loadRateio(parent: RateioParent): Promise<RateioRow[]> {
  const col = "expense_id" in parent ? "expense_id" : "card_item_id";
  const val = "expense_id" in parent ? parent.expense_id : parent.card_item_id;
  const { data, error } = await (supabase.from("despesa_rateio_veiculos" as any) as any)
    .select("id, veiculo_id, valor_rateado, percentual")
    .eq(col, val);
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: r.id,
    veiculo_id: r.veiculo_id,
    valor_rateado: Number(r.valor_rateado || 0),
    percentual: r.percentual === null || r.percentual === undefined ? null : Number(r.percentual),
  }));
}

/** Substitui o rateio do registro pai pelas linhas informadas */
export async function saveRateio(parent: RateioParent, rows: RateioRow[], userId?: string | null) {
  const col = "expense_id" in parent ? "expense_id" : "card_item_id";
  const val = "expense_id" in parent ? parent.expense_id : parent.card_item_id;

  await (supabase.from("despesa_rateio_veiculos" as any) as any).delete().eq(col, val);

  const valid = rows.filter((r) => r.veiculo_id && Number(r.valor_rateado) > 0);
  if (valid.length === 0) return;

  const { error } = await (supabase.from("despesa_rateio_veiculos" as any) as any).insert(
    valid.map((r) => ({
      [col]: val,
      veiculo_id: r.veiculo_id,
      valor_rateado: Number(r.valor_rateado),
      percentual: r.percentual ?? null,
      created_by: userId || null,
    })),
  );
  if (error) throw error;
}

/** Custo rateado por veículo, agrupado por chave do registro pai */
export async function loadRateioByVeiculo(veiculoId: string) {
  const { data } = await (supabase.from("despesa_rateio_veiculos" as any) as any)
    .select("id, expense_id, card_item_id, valor_rateado")
    .eq("veiculo_id", veiculoId);
  return (data || []) as Array<{ id: string; expense_id: string | null; card_item_id: string | null; valor_rateado: number }>;
}
