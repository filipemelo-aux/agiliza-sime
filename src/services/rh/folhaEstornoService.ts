import { supabase } from "@/integrations/supabase/client";

export type PreviaEstornoFolha = {
  item_id: string;
  colaborador: string;
  total: number;
  pagamentos: { id: string; descricao: string; valor: number; data: string; forma: string; reembolso: boolean }[];
};

export async function consultarEstornoFolha(itemId: string): Promise<PreviaEstornoFolha> {
  const { data, error } = await supabase.rpc("delete_payroll_item_with_reversal", { _item_id: itemId });
  if (error) throw error;
  return data as unknown as PreviaEstornoFolha;
}

export async function excluirFolhaComEstorno(previa: PreviaEstornoFolha): Promise<void> {
  const { error } = await supabase.rpc("delete_payroll_item_with_reversal", {
    _item_id: previa.item_id,
    _execute: true,
    _expected_payment_ids: previa.pagamentos.map(p => p.id),
  });
  if (error) throw error;
}