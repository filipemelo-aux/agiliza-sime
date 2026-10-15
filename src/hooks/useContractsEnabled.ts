import { usePageAccess } from "@/hooks/usePageAccess";

/** Contratos de Frete só ficam disponíveis (inclusive na emissão do CT-e) se a página estiver liberada para a empresa/usuário. */
export function useContractsEnabled() {
  const { getRule } = usePageAccess();
  return getRule("/admin/freight/contracts").mode !== "hidden";
}
