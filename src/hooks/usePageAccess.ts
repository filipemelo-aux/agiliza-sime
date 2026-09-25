import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export type PageMode = "active" | "hidden" | "maintenance";
export interface PageRule {
  id: string;
  page_url: string;
  mode: PageMode;
  user_id: string | null;
  message: string | null;
}

export const PAGE_RULES_KEY = ["page-access-rules"];

export function usePageRules() {
  return useQuery({
    queryKey: PAGE_RULES_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("page_access_rules").select("id,page_url,mode,user_id,message");
      if (error) throw error;
      return (data || []) as PageRule[];
    },
    staleTime: 60_000,
  });
}

/** Regra de usuário tem prioridade sobre a regra geral. Admin/moderador nunca são bloqueados. */
export function usePageAccess() {
  const { user, canAccessSettings } = useUserRole();
  const { data: rules = [] } = usePageRules();

  const getRule = (url: string): { mode: PageMode; message: string | null } => {
    if (!url || url === "/admin/settings" || canAccessSettings) return { mode: "active", message: null };
    const mine = rules.find((r) => r.page_url === url && user && r.user_id === user.id);
    if (mine) return { mode: mine.mode, message: mine.message };
    const global = rules.find((r) => r.page_url === url && !r.user_id);
    if (global) return { mode: global.mode, message: global.message };
    return { mode: "active", message: null };
  };
  return { getRule, rules };
}
