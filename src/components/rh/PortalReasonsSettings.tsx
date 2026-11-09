import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { maskSentence } from "@/lib/masks";
import { DEFAULT_PORTAL_REASONS, validatePortalReasons } from "../../../supabase/functions/_shared/driverPortalReasons";

export function PortalReasonsSettings() {
  const { tenant } = useTenant();
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["driver-portal-reasons", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      if (!tenant) throw new Error("Empresa não encontrada.");
      const { data, error } = await supabase.from("driver_portal_settings").select("reimbursement_reasons").eq("tenant_id", tenant.id).maybeSingle();
      if (error) throw error;
      return data ? validatePortalReasons(data.reimbursement_reasons as string[]) : [...DEFAULT_PORTAL_REASONS];
    },
  });
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const save = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      const reasons = validatePortalReasons(draft);
      const { error } = await supabase.from("driver_portal_settings").upsert({ tenant_id: tenant.id, reimbursement_reasons: reasons });
      if (error) throw error;
      await query.refetch();
      toast.success("Motivos de reembolso salvos.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar os motivos."); }
    finally { setSaving(false); }
  };
  return <section className="space-y-3 max-w-2xl">
    <h3 className="text-sm font-semibold">Motivos de reembolso</h3>
    {query.isLoading || !tenant ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : query.isError ? <div className="flex items-center gap-2"><p className="text-xs text-destructive">Não foi possível carregar os motivos.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <>
      <div className="space-y-2">
        {draft.map((reason, index) => <div key={index} className="flex items-center gap-2">
          <Label htmlFor={`portal-reason-${index}`} className="sr-only">Motivo {index + 1}</Label>
          <Input id={`portal-reason-${index}`} value={reason} maxLength={80} disabled={saving} className="h-9" onChange={(event) => setDraft(draft.map((value, i) => i === index ? maskSentence(event.target.value) : value))} />
          <Button variant="ghost" size="icon" title="Remover motivo" aria-label={`Remover motivo ${index + 1}`} disabled={saving || draft.length === 1} onClick={() => setDraft(draft.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving || draft.length >= 100} onClick={() => setDraft([...draft, ""])}><Plus className="h-4 w-4 mr-2" />Adicionar motivo</Button>
        <Button disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Salvar motivos</Button>
      </div>
    </>}
  </section>;
}