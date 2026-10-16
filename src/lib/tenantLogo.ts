import { supabase } from "@/integrations/supabase/client";
import simeLogo from "@/assets/logo.png";

const SIME_CNPJ = "23662751000179";

/** Logo da empresa (tenant) atual em URL absoluta, para cabeçalhos de impressão. */
export async function getCurrentTenantLogoUrl(): Promise<string | null> {
  const { data: tid } = await (supabase.rpc as any)("current_tenant_id");
  if (!tid) return null;
  const { data } = await (supabase.from as any)("tenants").select("logo_url, cnpj").eq("id", tid).maybeSingle();
  if (data?.logo_url) return data.logo_url as string;
  if (String(data?.cnpj || "").replace(/\D/g, "") === SIME_CNPJ) return new URL(simeLogo, window.location.origin).href;
  return null;
}
