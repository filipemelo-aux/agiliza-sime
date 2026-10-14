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

export function UserNameCell({ userId }: { userId?: string | null }) {
  const { data } = useUserNames();
  const full = (userId && data?.[userId]) || "";
  return (
    <span
      className="block break-words leading-tight"
      title={full}
    >
      {full || "—"}
    </span>
  );
}
