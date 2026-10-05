import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import simeLogo from "@/assets/logo.png";

const SIME_CNPJ = "23662751000179";

export interface CurrentTenant {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  logo_url: string | null;
}

/** Empresa (tenant) em que o usuário está — a própria ou a do modo suporte. */
export function useTenant() {
  const { user, supportTenantId } = useAuth();
  const q = useQuery({
    queryKey: ["current-tenant", user?.id, supportTenantId],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: tid } = await (supabase.rpc as any)("current_tenant_id");
      if (!tid) return null;
      const { data } = await (supabase.from as any)("tenants")
        .select("id, razao_social, nome_fantasia, cnpj, logo_url").eq("id", tid).maybeSingle();
      return (data as CurrentTenant) ?? null;
    },
  });
  const t = q.data ?? null;
  const name = (t?.nome_fantasia || t?.razao_social || "").toUpperCase();
  const logo = t?.logo_url || (t?.cnpj === SIME_CNPJ ? simeLogo : null);
  return { tenant: t, name, logo, loading: q.isLoading };
}
