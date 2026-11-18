type Proprietario = { id: string; user_id: string | null; cnpj: string | null };

// Prefer canonical IDs; legacy vehicles may still hold the owner's auth ID.
export function documentoDoProprietario(ownerId: string, profiles: Proprietario[]): string {
  const canonical = profiles.find(p => p.id === ownerId);
  if (canonical) return canonical.cnpj?.trim() ?? "";
  const legacy = profiles.filter(p => p.user_id === ownerId);
  if (legacy.length > 1) throw new Error("Mais de um proprietário corresponde ao vínculo antigo. Selecione novamente o proprietário no cadastro do veículo.");
  return legacy[0]?.cnpj?.trim() ?? "";
}