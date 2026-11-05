import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_RH_PERIOD_CONFIG, validateRHPeriodConfig, type RHPeriodConfig } from "@/lib/rhPeriodConfig";
export function useRHPeriodConfig() {
  const { user, supportTenantId } = useAuth();
  const client = useQueryClient();
  const queryKey = ["rh-period-config", user?.id, supportTenantId];
  const query = useQuery({ queryKey, enabled: !!user, queryFn: async () => {
    const { data, error } = await (supabase.rpc as any)("get_rh_period_config");
    if (error) throw error;
    const config = data as RHPeriodConfig;
    if (validateRHPeriodConfig(config)) throw new Error("Configuração de quinzenas inválida");
    return config;
  }});
  const save = async (config: RHPeriodConfig) => {
    const validation = validateRHPeriodConfig(config);
    if (validation) throw new Error(validation);
    const { error } = await (supabase.rpc as any)("save_rh_period_config", { _config: config });
    if (error) throw error;
    client.setQueryData(queryKey, config);
    await client.invalidateQueries({ queryKey });
  };
  return { config: query.data ?? DEFAULT_RH_PERIOD_CONFIG, loading: query.isLoading, error: query.error, save };
}