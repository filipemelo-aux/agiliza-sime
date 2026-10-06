import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface HmlResult { nome: string; ok: boolean; steps: { label: string; ok: boolean; message: string }[] }

export async function runHomologationTest(tenantId: string, establishmentId: string, nome: string): Promise<HmlResult> {
  const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "homologation_test", tenant_id: tenantId, establishment_id: establishmentId } });
  if (error || data?.error) return { nome, ok: false, steps: [{ label: "Teste", ok: false, message: data?.error || "Erro ao executar o teste" }] };
  return { nome, ok: data.ok, steps: data.steps || [] };
}

export function HomologationResult({ r }: { r: HmlResult }) {
  return (
    <div className={`rounded border p-2 text-xs space-y-1 ${r.ok ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"}`}>
      <div className="font-semibold">Teste de homologação — {r.nome}: {r.ok ? "tudo pronto para emitir em homologação" : "há pendências"}</div>
      {r.steps.map((st) => (
        <div key={st.label} className="flex items-start gap-1.5">
          {st.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-px" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-px" />}
          <span><b>{st.label}:</b> {st.message}</span>
        </div>
      ))}
    </div>
  );
}
