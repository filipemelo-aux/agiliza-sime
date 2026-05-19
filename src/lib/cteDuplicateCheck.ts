import { supabase } from "@/integrations/supabase/client";

export interface DuplicateMatch {
  id: string;
  numero: number | null;
  numero_interno: number | null;
  data_emissao: string | null;
  placa_veiculo: string | null;
  peso_bruto: number | null;
  remetente_nome: string | null;
  destinatario_nome: string | null;
  tipo_talao: string | null;
  match_reason: "peso_data" | "peso_placa";
}

/**
 * Procura CT-es com indícios de duplicidade:
 *  - mesmo peso E mesma data (qualquer placa), OU
 *  - mesmo peso E mesma placa (qualquer data)
 */
export async function findCteDuplicates(params: {
  pesoBruto: number;
  dataEmissao: string; // YYYY-MM-DD
  placaVeiculo?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateMatch[]> {
  const { pesoBruto, dataEmissao, placaVeiculo, excludeId } = params;
  if (!pesoBruto || pesoBruto <= 0 || !dataEmissao) return [];

  const placa = (placaVeiculo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const dayStart = `${dataEmissao}T00:00:00`;
  const dayEnd = `${dataEmissao}T23:59:59.999`;

  // Busca todos os CT-es com mesmo peso, depois filtra em memória
  let query = supabase
    .from("ctes")
    .select("id, numero, numero_interno, data_emissao, placa_veiculo, peso_bruto, remetente_nome, destinatario_nome, tipo_talao")
    .eq("peso_bruto", pesoBruto)
    .limit(50);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error || !data) return [];

  const matches: DuplicateMatch[] = [];
  for (const row of data as any[]) {
    const rowDataIso = row.data_emissao ? String(row.data_emissao) : "";
    const sameData = rowDataIso >= dayStart && rowDataIso <= dayEnd;
    const rowPlaca = String(row.placa_veiculo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const samePlaca = placa && rowPlaca && placa === rowPlaca;
    if (sameData) {
      matches.push({ ...row, match_reason: "peso_data" });
    } else if (samePlaca) {
      matches.push({ ...row, match_reason: "peso_placa" });
    }
  }
  return matches;
}

export function buildDuplicateConfirmMessage(matches: DuplicateMatch[]): string {
  const lines = matches.slice(0, 5).map((m) => {
    const num = m.numero ?? m.numero_interno ?? "—";
    const data = m.data_emissao ? String(m.data_emissao).slice(0, 10).split("-").reverse().join("/") : "—";
    const placa = m.placa_veiculo || "—";
    const peso = m.peso_bruto ? `${Number(m.peso_bruto).toLocaleString("pt-BR")} kg` : "—";
    const motivo = m.match_reason === "peso_data" ? "mesmo peso e data" : "mesmo peso e placa";
    return `• Nº ${num} — ${data} — Placa ${placa} — ${peso} (${motivo})`;
  });
  const extra = matches.length > 5 ? `\n…e mais ${matches.length - 5} registro(s).` : "";
  return `Foram encontrados ${matches.length} CT-e(s) com possível duplicidade:\n\n${lines.join("\n")}${extra}\n\nDeseja prosseguir mesmo assim?`;
}
