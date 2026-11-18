import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";

const CARGO = ["Aberta", "Baú", "Caçamba", "Graneleiro", "Tanque", "Sider", "Plataforma"];

interface Props { open: boolean; onOpenChange: (o: boolean) => void; vehicleIds: string[]; plates: string[]; onSaved: () => void; }

function Row({ k, label, checked, onToggle, children }: { k: string; label: string; checked: boolean; onToggle: (v: boolean | "indeterminate") => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2"><Checkbox id={`be-${k}`} checked={checked} onCheckedChange={onToggle} /><Label htmlFor={`be-${k}`} className="text-xs">{label}</Label></div>
      <div className={checked ? "" : "pointer-events-none opacity-50"}>{children}</div>
    </div>
  );
}

export function VehicleBatchEditDialog({ open, onOpenChange, vehicleIds, plates, onSaved }: Props) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [ownerId, setOwnerId] = useState(""); const [ownerName, setOwnerName] = useState(""); const [ownerDoc, setOwnerDoc] = useState<string | null>(null);
  const [fleetType, setFleetType] = useState("propria");
  const [cargoType, setCargoType] = useState("none");
  const [antt, setAntt] = useState("");
  const [intervalo, setIntervalo] = useState("");
  const [saving, setSaving] = useState(false);
  const t = (k: string) => (v: boolean | "indeterminate") => setOn(p => ({ ...p, [k]: v === true }));

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (on.owner) { if (!ownerId) return toast.error("Selecione o proprietário."); patch.owner_id = ownerId; }
    if (on.fleet) patch.fleet_type = fleetType;
    if (on.cargo) patch.cargo_type = cargoType === "none" ? null : cargoType;
    if (on.antt) patch.antt_number = antt.trim() || null;
    if (on.intervalo) patch.intervalo_revisao_km = intervalo ? Number(intervalo) : null;
    if (!Object.keys(patch).length) return toast.error("Marque ao menos um campo para alterar.");
    setSaving(true);
    const { error } = await supabase.from("vehicles").update(patch as any).in("id", vehicleIds);
    setSaving(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success(`${vehicleIds.length} veículo(s) atualizado(s).`);
    setOn({}); onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edição em lote — {vehicleIds.length} veículo(s)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Placas: {plates.join(", ")}. Só os campos marcados serão alterados.</p>
        <div className="space-y-3">
          <Row k="owner" checked={!!on.owner} onToggle={t("owner")} label="Proprietário">
            <PersonSearchInput categories={["proprietario"]} placeholder="Buscar proprietário..." editableSelection selectedName={ownerName || undefined} selectedDocument={ownerDoc}
              onSelect={p => { setOwnerId(p.id); setOwnerName(p.razao_social || p.full_name); setOwnerDoc(p.cnpj); }}
              onClear={() => { setOwnerId(""); setOwnerName(""); setOwnerDoc(null); }} />
          </Row>
          <Row k="fleet" checked={!!on.fleet} onToggle={t("fleet")} label="Tipo de frota">
            <Select value={fleetType} onValueChange={setFleetType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="propria">Frota Própria</SelectItem><SelectItem value="terceiros">Frota Terceiros</SelectItem></SelectContent></Select>
          </Row>
          <Row k="cargo" checked={!!on.cargo} onToggle={t("cargo")} label="Carroceria">
            <Select value={cargoType} onValueChange={setCargoType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Não se aplica</SelectItem>{CARGO.map(c => <SelectItem key={c} value={c.toLowerCase()}>{c}</SelectItem>)}</SelectContent></Select>
          </Row>
          <Row k="antt" checked={!!on.antt} onToggle={t("antt")} label="RNTRC"><Input value={antt} onChange={e => setAntt(e.target.value)} /></Row>
          <Row k="intervalo" checked={!!on.intervalo} onToggle={t("intervalo")} label="Intervalo de revisão (KM)"><Input type="number" min="0" value={intervalo} onChange={e => setIntervalo(e.target.value)} /></Row>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Aplicar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
