/**
 * CT-es elegíveis para comissão de motorista.
 *
 * Regras de elegibilidade:
 *  1. CT-e foi transmitido com sucesso à SEFAZ (status = "autorizado").
 *  2. Possui motorista vinculado (`motorista_id` não nulo).
 *  3. Motorista é colaborador (RH) — `profiles.is_colaborador_rh = true`.
 *  4. Ainda NÃO existe comissão gerada para este CT-e + motorista.
 */
import { supabase } from "@/integrations/supabase/client";

export type CteElegivel = {
  id: string;
  numero: number | null;
  serie: number;
  data_emissao: string | null;
  valor_frete: number;
  motorista_id: string;
  motorista_nome: string;
  destinatario_nome: string | null;
  remetente_nome: string | null;
  jaComissionado: boolean;
};

export async function fetchCtesElegiveisComissao(motoristaId?: string): Promise<CteElegivel[]> {
  // 1. Carrega CT-es autorizados com motorista
  let q = supabase
    .from("ctes")
    .select(
      "id, numero, serie, data_emissao, valor_frete, motorista_id, destinatario_nome, remetente_nome"
    )
    .eq("status", "autorizado")
    .not("motorista_id", "is", null)
    .order("data_emissao", { ascending: false });

  if (motoristaId) q = q.eq("motorista_id", motoristaId);

  const { data: ctes, error } = await q;
  if (error) throw error;
  if (!ctes || ctes.length === 0) return [];

  // 2. Filtra motoristas que são colaboradores RH
  const motoristaIds = Array.from(new Set(ctes.map((c) => c.motorista_id as string)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, is_colaborador_rh")
    .in("id", motoristaIds);
  const colabMap = new Map<string, string>();
  (profiles || []).forEach((p: any) => {
    if (p.is_colaborador_rh === true) colabMap.set(p.id, p.full_name);
  });

  // 3. Remove CT-es que já têm comissão gerada
  const cteIds = ctes.filter((c) => colabMap.has(c.motorista_id as string)).map((c) => c.id);
  if (cteIds.length === 0) return [];

  const { data: jaComissionados } = await (supabase.from("comissoes" as any) as any)
    .select("referencia_id")
    .eq("origem", "cte")
    .in("referencia_id", cteIds);
  const blocked = new Set<string>((jaComissionados || []).map((r: any) => r.referencia_id));

  return ctes
    .filter((c) => colabMap.has(c.motorista_id as string))
    .map((c) => ({
      id: c.id,
      numero: c.numero,
      serie: c.serie,
      data_emissao: c.data_emissao,
      valor_frete: Number(c.valor_frete) || 0,
      motorista_id: c.motorista_id as string,
      motorista_nome: colabMap.get(c.motorista_id as string)!,
      destinatario_nome: c.destinatario_nome,
      remetente_nome: c.remetente_nome,
      jaComissionado: blocked.has(c.id),
    }));
}
