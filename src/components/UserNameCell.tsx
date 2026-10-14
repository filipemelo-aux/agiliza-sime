import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Nome de quem criou o registro. Nomes muito longos são cortados com "…"
 * e aparecem por extenso ao passar o mouse, como nas colunas Cliente/Descrição.
 */
export function UserNameCell({ userId }: { userId?: string | null; maxLength?: number }) {
  const { data } = useUserNames();
  const full = (userId && data?.[userId]) || "";
  return (
    <span
      className="block truncate whitespace-nowrap leading-tight"
      title={full}
    >
      {full || "—"}
    </span>
  );
}
