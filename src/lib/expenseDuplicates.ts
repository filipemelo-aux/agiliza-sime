import { supabase } from "@/integrations/supabase/client";

export interface DuplicateCandidate {
  id: string;
  descricao: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  fornecedor_cnpj: string | null;
  documento_fiscal_numero: string | null;
  valor_total: number | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  status: string | null;
  created_at: string | null;
}

export interface DuplicateInput {
  selfId?: string | null;
  favorecidoId?: string | null;
  fornecedorCnpj?: string | null;
  documento?: string | null;
  valor?: number | null;
  vencimento?: string | null;
}

export type DuplicateReason = "documento" | "valor_vencimento";
export interface DuplicateMatch { expense: DuplicateCandidate; reason: DuplicateReason }

const onlyDigits = (v?: string | null) => (v || "").replace(/\D/g, "");
/** Normaliza nº de documento: remove pontuação e zeros à esquerda ("000.026.801" == "26801"). */
export const normDoc = (v?: string | null) => (v || "").replace(/[^0-9a-z]/gi, "").replace(/^0+/, "").toUpperCase();

/** Regra pura: mesmo fornecedor + mesmo nº documento; ou mesmo fornecedor + mesmo valor + mesmo vencimento. */
export function classifyDuplicates(input: DuplicateInput, rows: DuplicateCandidate[]): DuplicateMatch[] {
  const doc = normDoc(input.documento);
  const cnpj = onlyDigits(input.fornecedorCnpj);
  const out: DuplicateMatch[] = [];
  for (const r of rows) {
    if (input.selfId && r.id === input.selfId) continue;
    const sameSupplier =
      (!!input.favorecidoId && r.favorecido_id === input.favorecidoId) ||
      (cnpj.length >= 11 && onlyDigits(r.fornecedor_cnpj) === cnpj);
    if (!sameSupplier) continue;
    if (doc && normDoc(r.documento_fiscal_numero) === doc) { out.push({ expense: r, reason: "documento" }); continue; }
    if (
      input.valor && input.vencimento && r.data_vencimento &&
      Math.abs(Number(r.valor_total || 0) - input.valor) < 0.01 &&
      String(r.data_vencimento).slice(0, 10) === input.vencimento.slice(0, 10)
    ) out.push({ expense: r, reason: "valor_vencimento" });
  }
  return out;
}

export async function findDuplicateExpenses(input: DuplicateInput): Promise<DuplicateMatch[]> {
  const cnpj = onlyDigits(input.fornecedorCnpj);
  if (!input.favorecidoId && cnpj.length < 11) return [];
  const ors: string[] = [];
  if (input.favorecidoId) ors.push(`favorecido_id.eq.${input.favorecidoId}`);
  if (input.fornecedorCnpj?.trim()) ors.push(`fornecedor_cnpj.eq.${input.fornecedorCnpj.trim()}`);
  if (cnpj && cnpj !== input.fornecedorCnpj?.trim()) ors.push(`fornecedor_cnpj.eq.${cnpj}`);
  const { data, error } = await supabase
    .from("expenses")
    .select("id, descricao, favorecido_nome, favorecido_id, fornecedor_cnpj, documento_fiscal_numero, valor_total, data_emissao, data_vencimento, status, created_at")
    .is("deleted_at", null)
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return classifyDuplicates(input, (data as any[]) || []);
}
