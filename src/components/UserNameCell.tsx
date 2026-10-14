import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { limitDisplayText } from "@/lib/displayText";

/** Mapa user_id (auth) -> nome do perfil, em cache compartilhado. */
export function useUserNames() {
  return useQuery({
    queryKey: ["user-names-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id,full_name").not("user_id", "is", null);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { if (p.user_id) map[p.user_id] = p.full_name || ""; });
      return map;
    },
  });
}

/** Corta no último espaço antes do limite, para não partir o sobrenome no meio. */
function shortenName(full: string, maxLength: number) {
  if (full.length <= maxLength) return full;
  const cut = full.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const keep = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${keep.trimEnd()}…`;
}

/**
 * Nome de quem criou o registro. Nomes muito longos são cortados com "…"
 * e aparecem por extenso ao passar o mouse, como nas colunas Cliente/Descrição.
 */
export function UserNameCell({ userId, maxLength = 24 }: { userId?: string | null; maxLength?: number }) {
  const { data } = useUserNames();
  const full = (userId && data?.[userId]) || "";
  return (
    <span
      className="block truncate whitespace-nowrap leading-tight"
      title={full}
    >
      {shortenName(full || "—", maxLength)}
    </span>
  );
}
