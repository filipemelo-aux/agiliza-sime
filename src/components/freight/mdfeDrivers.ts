import { supabase } from "@/integrations/supabase/client";

export type MdfeDriver = { id?: string | null; nome?: string | null; cpf?: string | null };
export const driverCpf = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 ? digits : "";
};

/** Preserve fiscal snapshots; enrich older manifests through the internal profile ID. */
export async function resolveMdfeDrivers(drivers: MdfeDriver[]): Promise<MdfeDriver[]> {
  const ids = [...new Set(drivers.filter(d => d.id && (!driverCpf(d.cpf) || !d.nome)).map(d => String(d.id)))];
  if (!ids.length) return drivers.map(d => ({ ...d, cpf: driverCpf(d.cpf) }));
  const { data: profiles, error } = await supabase.from("profiles").select("id,user_id,full_name,cnpj").in("id", ids);
  if (error) throw error;
  const people = profiles || [];
  const missing = people.filter(p => !driverCpf(p.cnpj));
  const documentIds = [...new Set(missing.flatMap(p => [p.id, p.user_id].filter((id): id is string => !!id)))];
  const documents = documentIds.length
    ? await supabase.from("driver_documents").select("user_id,cpf").in("user_id", documentIds)
    : { data: [] };
  return drivers.map(d => {
    const p = people.find(p => p.id === d.id);
    const doc = documents.data?.find(doc => doc.user_id === p?.user_id || doc.user_id === p?.id);
    return { ...d, nome: d.nome || p?.full_name || "", cpf: driverCpf(d.cpf) || driverCpf(p?.cnpj) || driverCpf(doc?.cpf) };
  });
}