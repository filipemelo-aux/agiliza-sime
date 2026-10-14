// Cadastra automaticamente como fornecedor os atores de uma NF-e (emitente,
// destinatário, transportadora) que ainda não existem no cadastro de pessoas.
import { supabase } from "@/integrations/supabase/client";
import { maskName } from "@/lib/masks";
import type { NfeParty } from "@/lib/nfeImport";

export async function registerNfeActorsAsSuppliers(parties: (NfeParty | null | undefined)[]): Promise<number> {
  const docs = new Map<string, NfeParty>();
  for (const p of parties) {
    const d = (p?.documento || "").replace(/\D/g, "");
    if (p && (d.length === 14 || d.length === 11) && p.nome) docs.set(d, p);
  }
  if (!docs.size) return 0;
  // Não cadastra a própria empresa (matriz/filiais)
  const { data: ests } = await supabase.from("fiscal_establishments").select("cnpj");
  for (const e of (ests as any[]) || []) docs.delete(String(e.cnpj || "").replace(/\D/g, ""));
  if (!docs.size) return 0;

  const { data: existing } = await supabase
    .from("profiles").select("id, cnpj, category, categories_extra").in("cnpj", [...docs.keys()]);
  let created = 0;
  for (const [doc, p] of docs) {
    const found = ((existing as any[]) || []).find((x) => String(x.cnpj).replace(/\D/g, "") === doc);
    if (found) {
      const extras: string[] = found.categories_extra || [];
      if (found.category !== "fornecedor" && !extras.includes("fornecedor")) {
        await supabase.from("profiles").update({ categories_extra: [...extras, "fornecedor"] } as any).eq("id", found.id);
      }
      continue;
    }
    const [street, number, neighborhood] = (p.endereco || "").split(",").map((s) => s.trim());
    const nome = maskName(p.nome);
    const { error } = await supabase.from("profiles").insert({
      user_id: crypto.randomUUID(),
      full_name: nome,
      razao_social: nome,
      person_type: doc.length === 14 ? "cnpj" : "cpf",
      cnpj: doc,
      category: "fornecedor",
      inscricao_estadual: p.ie || null,
      address_street: street ? maskName(street) : null,
      address_number: number || null,
      address_neighborhood: neighborhood ? maskName(neighborhood) : null,
      address_city: p.municipio ? maskName(p.municipio) : null,
      address_state: p.uf || null,
      address_ibge: p.municipio_ibge || null,
    } as any);
    if (!error) created++;
  }
  return created;
}
