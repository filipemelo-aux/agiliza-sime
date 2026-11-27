import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/lib/notice";

import { Checkbox } from "@/components/ui/checkbox";

const UFS = ["GO", "MA", "PA", "TO"];
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function DebtAutoConfigDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [weekday, setWeekday] = useState("1");
  const [ufs, setUfs] = useState<string[]>(UFS);
  const [summary, setSummary] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("fleet_debt_auto_config").select("*").maybeSingle().then(({ data, error }) => {
      if (error) { toast.error("Não foi possível ler a configuração: " + error.message); return; }
      setEnabled(!!data?.enabled); setWeekday(String(data?.weekday ?? 1)); setSummary(data?.last_run_summary ?? null); setUfs(data?.ufs ?? UFS);
    });
  }, [open]);

  const [running, setRunning] = useState(false);
  const consultarAgora = async () => {
    if (ufs.length === 0) { toast.error("Selecione ao menos um estado para consultar."); return; }
    setRunning(true);
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const { data: tenantId } = await supabase.rpc("current_tenant_id");
    const { error } = await supabase.from("fleet_debt_auto_config").upsert({
      tenant_id: tenantId as string, enabled, weekday: Number(weekday), ufs, acting_user_id: user?.id ?? null,
      manual_run_date: hoje, last_run_date: null, last_run_summary: null, updated_at: new Date().toISOString(),
    });
    if (error) { setRunning(false); toast.error("Não foi possível iniciar: " + error.message); return; }
    supabase.functions.invoke("vehicle-debts-auto", { body: {} }).catch(() => {});
    setRunning(false);
    setSummary({ data: hoje, consultadas: 0, concluida: false });
    toast.success("Consulta iniciada em segundo plano. As placas serão consultadas aos poucos ao longo do dia.");
  };

  const salvar = async () => {
    if (enabled && ufs.length === 0) { toast.error("Selecione ao menos um estado para a consulta automática."); return; }
    setSaving(true);
    const { data: tenantId } = await supabase.rpc("current_tenant_id");
    const { error } = await supabase.from("fleet_debt_auto_config").upsert({
      tenant_id: tenantId as string, enabled, weekday: Number(weekday), ufs, acting_user_id: user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error("Não foi possível salvar: " + error.message); return; }
    toast.success(enabled ? `Consulta automática ativada: toda ${DIAS[Number(weekday)].toLowerCase()}.` : "Consulta automática desativada.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Consulta automática de débitos</DialogTitle></DialogHeader>
        <div className="space-y-4 text-xs">
          <p className="text-muted-foreground">Consulta em segundo plano todas as placas da frota própria dos estados marcados abaixo, conforme a UF do proprietário, para acompanhar novas multas, IPVA e licenciamento. As consultas começam às 6h e são feitas aos poucos ao longo do dia; cada placa consome créditos da InfoSimples.</p>
          <div className="flex items-center justify-between"><Label className="text-xs">Ativar consulta automática</Label><Switch checked={enabled} onCheckedChange={setEnabled} /></div>
          <div><Label className="text-xs">Dia da semana</Label>
            <Select value={weekday} onValueChange={setWeekday} disabled={!enabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Estados a consultar (UF do proprietário)</Label>
            <div className="mt-1 flex flex-wrap gap-4">
              {UFS.map((uf) => (
                <label key={uf} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={ufs.includes(uf)} disabled={!enabled} onCheckedChange={(c) => setUfs((p) => c ? [...p, uf] : p.filter((x) => x !== uf))} />{uf}
                </label>
              ))}
            </div>
          </div>
          {summary && (
            <div className="rounded-md border border-border p-2 space-y-1">
              <div className="font-semibold">Última execução: {String(summary.data).split("-").reverse().join("/")} {summary.concluida ? "" : "(em andamento)"}</div>
              <div>Placas consultadas: {summary.consultadas} de {summary.total ?? "?"}</div>
              <div className={summary.novas_multas?.length ? "text-destructive font-semibold" : ""}>Novas multas: {summary.novas_multas?.length ? summary.novas_multas.join(", ") : "nenhuma"}</div>
              {summary.falhas?.length > 0 && <div className="text-muted-foreground">Falhas: {summary.falhas.join("; ")}</div>}
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" className="sm:mr-auto" onClick={consultarAgora} disabled={running || saving}>Consultar agora</Button><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
