import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { listSystemPages } from "@/components/AdminLayout";

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

/** Prefixo usado para regras aplicadas a um menu inteiro (ex.: "menu:Financeiro"). */
export const MENU_PREFIX = "menu:";

/** Regra de usuário tem prioridade sobre a regra geral; regra da página tem prioridade sobre a do menu. Admin/moderador nunca são bloqueados. */
export function usePageAccess() {
  const { user, canAccessSettings } = useUserRole();
  const { data: rules = [] } = usePageRules();

  const getRule = (url: string): { mode: PageMode; message: string | null } => {
    if (!url || url === "/admin/settings" || canAccessSettings) return { mode: "active", message: null };
    const menu = listSystemPages().find((p) => p.url === url)?.group.split(" › ")[0];
    const menuKey = menu ? MENU_PREFIX + menu : null;
    const pick = (key: string | null, mine: boolean) =>
      key ? rules.find((r) => r.page_url === key && (mine ? !!user && r.user_id === user.id : !r.user_id)) : undefined;
    const r = pick(url, true) || pick(menuKey, true) || pick(url, false) || pick(menuKey, false);
    return r ? { mode: r.mode, message: r.message } : { mode: "active", message: null };
  };
  return { getRule, rules };
}
