import { useEffect, useRef, useState } from "react";
import { Check, Link2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "@/lib/notice";
import { assignmentValidation, isImplement, unitCategory, unitLabel } from "@/lib/vehicleUnits";
import { maskPlate, maskDocument } from "@/lib/masks";
import { matchesText } from "@/lib/search";
import type { Tables } from "@/integrations/supabase/types";

type Assignment = Tables<"vehicle_assignments">;
type Vehicle = Tables<"vehicles">;
type Person = Pick<Tables<"profiles">,"id"|"full_name"|"cnpj">;

type PlateOption = { id: string; plate: string; label: string; note?: string };

const PlateCombobox = ({ options, value, onSelect, onClear, placeholder }: { options: PlateOption[]; value: string; onSelect: (id: string) => void; onClear?: () => void; placeholder: string }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => !query.trim() || matchesText(`${o.plate} ${o.label}`, query));
  return <div className="flex gap-1.5">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2.5 border-input hover:border-primary/40 hover:bg-background">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? `${maskPlate(selected.plate)} — ${selected.label}${selected.note ? ` ${selected.note}` : ""}` : placeholder}</span>
          <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] shadow-lg border-border/60 rounded-lg overflow-hidden max-w-[calc(100vw-2rem)]" align="start" sideOffset={4}>
        <Command shouldFilter={false} className="bg-popover">
          <CommandInput className="h-10 text-xs border-0 focus:ring-0 focus:outline-none" placeholder="Digite a placa..." value={query} onValueChange={setQuery}/>
          <CommandList className="max-h-64">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">Nenhuma placa encontrada.</CommandEmpty>
            <CommandGroup className="p-1.5">
              {filtered.map(o => <CommandItem key={o.id} value={o.id} className="text-xs" onSelect={() => { onSelect(o.id); setOpen(false); setQuery(""); }}>
                <span className="font-medium">{maskPlate(o.plate)}</span><span className="text-muted-foreground ml-1">— {o.label}</span>{o.note && <span className="text-warning ml-1">{o.note}</span>}
                {o.id === value && <Check className="ml-auto h-3.5 w-3.5"/>}
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    {onClear && value && <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Remover seleção" onClick={() => { onClear(); setQuery(""); }}><X className="h-3.5 w-3.5"/></Button>}
  </div>;
};

export default function AdminVehicleAssignments() {
  const { canEdit, hasAdminAccess, loading: roleLoading } = useUserRole();
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [rows,setRows]=useState<Assignment[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("active");
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Assignment|null>(null);
  const [vehicleId,setVehicleId]=useState("");
  const [driverId,setDriverId]=useState("");
  const [driverName,setDriverName]=useState("");
  const [implementsIds,setImplements]=useState<string[]>(["","",""]);
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const lock=useRef(false);
  const load=async()=>{
    setLoading(true);
    try {
      const [a,v,p]=await Promise.all([
        fetchAllRows<Assignment>((from,to)=>supabase.from("vehicle_assignments").select("*").order("started_at",{ascending:false}).range(from,to)),
        fetchAllRows<Vehicle>((from,to)=>supabase.from("vehicles").select("*").order("plate").range(from,to)),
        fetchAllRows<Person>((from,to)=>supabase.from("profiles").select("id,full_name,cnpj").order("id").range(from,to)),
      ]);
      setRows(a.data || []);setVehicles(v.data || []);setPeople(p.data || []);setSelected(new Set());
    }catch(e){toast.error((e as {message?:string})?.message || "Erro ao carregar vinculações");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(!roleLoading && hasAdminAccess) void load();},[roleLoading,hasAdminAccess]);
  const vehicle=(id:string)=>vehicles.find(v=>v.id===id);
  const person=(id:string|null)=>people.find(p=>p.id===id);
  const current=rows.find(r=>selected.has(r.id));
  const active=rows.filter(r=>!r.ended_at && r.id!==editing?.id);
  const availableVehicles=vehicles.filter(v=>v.is_active!==false && !isImplement(v));
  const existing=active.find(a=>a.vehicle_id===vehicleId);
  const availableImplements=vehicles.filter(v=>v.is_active!==false && isImplement(v) && !active.some(a=>a.vehicle_id!==vehicleId && a.implement_ids.includes(v.id)));
  const begin=(row:Assignment|null)=>{
    setEditing(row);setVehicleId(row?.vehicle_id || "");setDriverId(row?.driver_profile_id || "");
    setDriverName(person(row?.driver_profile_id || null)?.full_name || "");
    setImplements([row?.implement_ids[0] || "",row?.implement_ids[1] || "",row?.implement_ids[2] || ""]);
    setNotes(row?.notes || "");setOpen(true);
  };
  const save=async()=>{
    if(lock.current || !canEdit) return;
    const v=vehicle(vehicleId);
    if(!v){toast.error("Selecione a placa da unidade de tração.");return;}
    const ids=implementsIds.filter(Boolean);
    const message=assignmentValidation(unitCategory(v),ids);
    if(message){toast.error(message);return;}
    lock.current=true;setSaving(true);
    try{
      const {data:id,error}=await supabase.rpc("save_vehicle_assignment",{_vehicle_id:vehicleId,_driver_profile_id:driverId || undefined,_implement_ids:ids,_previous_id:editing?.id || existing?.id,_notes:notes});
      if(error || !id) throw error || new Error("Vinculação não gravada");
      const {data:check,error:readError}=await supabase.from("vehicle_assignments").select("*").eq("id",id).single();
      if(readError || !check || check.ended_at || check.vehicle_id!==vehicleId || check.driver_profile_id!==(driverId || null) || check.implement_ids.join()!==ids.join()) throw new Error("Não foi possível confirmar a gravação. Atualize a lista antes de tentar novamente.");
      await load();setOpen(false);
    }catch(e){toast.error(e instanceof Error?e.message:(e as {message?:string})?.message || "Erro ao salvar vinculação");}
    finally{lock.current=false;setSaving(false);}
  };
  const filtered=rows.filter(r=>(status==="all" || (status==="active"?!r.ended_at:!!r.ended_at)) && (!search || matchesText([vehicle(r.vehicle_id)?.plate,person(r.driver_profile_id)?.full_name,...r.implement_ids.map(id=>vehicle(id)?.plate)].join(" "),search)));
  const date=(v:string|null)=>v?new Date(v).toLocaleString("pt-BR"):"—";
  const columns:DataGridColumn<Assignment>[]=[
    {key:"plate",header:"Tração / Veículo",width:"150px",cell:r=><div><span className="font-medium">{maskPlate(vehicle(r.vehicle_id)?.plate || "")}</span><div className="text-[10px] text-muted-foreground">{unitLabel(vehicle(r.vehicle_id) || {})}</div></div>},
    {key:"driver",header:"Motorista / Colaborador",cell:r=><div>{person(r.driver_profile_id)?.full_name || "—"}{person(r.driver_profile_id)?.cnpj && <div className="text-[10px] text-muted-foreground">{maskDocument(person(r.driver_profile_id)?.cnpj)}</div>}</div>},
    ...[0,1,2].map((index):DataGridColumn<Assignment>=>({key:`implement_${index}`,header:`${index+1}º Implemento`,width:"140px",sortValue:r=>vehicle(r.implement_ids[index] || "")?.plate || "",cell:r=>{const v=vehicle(r.implement_ids[index] || "");return v?<div><span className="font-medium">{maskPlate(v.plate)}</span><div className="text-[10px] text-muted-foreground">{unitLabel(v)}</div></div>:<span className="text-muted-foreground">—</span>;}})),
    {key:"start",header:"Início",width:"145px",cell:r=>date(r.started_at)},
    {key:"end",header:"Encerramento",width:"145px",cell:r=>date(r.ended_at)},
    {key:"status",header:"Status",width:"90px",cell:r=><span className={r.ended_at?"text-muted-foreground":"text-success"}>{r.ended_at?"Encerrado":"Ativo"}</span>},
  ];
  if(roleLoading || !hasAdminAccess) return null;
  const category=unitCategory(vehicle(vehicleId) || {});
  return <AdminLayout><main className="px-4 py-3 md:px-6 space-y-3">
    <PageTitle>Vinculações</PageTitle>
    <SearchFilterCard><FilterField label="Placa ou motorista" className="flex-1"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar placa ou motorista"/></FilterField><FilterField label="Status"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Ativos</SelectItem><SelectItem value="ended">Encerrados</SelectItem><SelectItem value="all">Todos</SelectItem></SelectContent></Select></FilterField></SearchFilterCard>
    <GlobalToolbar selectedCount={selected.size} actions={[
      {key:"new",label:"Nova vinculação",icon:Plus,mode:"create",disabled:!canEdit || saving,onClick:()=>begin(null)},
      {key:"edit",label:"Trocar motorista ou conjunto",icon:Pencil,mode:"single",disabled:!canEdit || saving || !!current?.ended_at,onClick:()=>current && begin(current)},
      {key:"refresh",label:"Atualizar",icon:RefreshCw,mode:"always",disabled:saving,onClick:()=>void load()},
    ]}/>
    <DataGrid rows={filtered} columns={columns} rowId={r=>r.id} selected={selected} onSelectedChange={setSelected} loading={loading} minWidth={1250} emptyMessage="Nenhuma vinculação encontrada." footer={<span className="text-xs text-muted-foreground">{filtered.length} vinculação(ões)</span>}/>
    <Dialog open={open} onOpenChange={v=>!saving && setOpen(v)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing?"Trocar vinculação":"Nova vinculação"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Tração / Veículo *</Label><PlateCombobox placeholder="Buscar placa..." options={availableVehicles.map(v=>({id:v.id,plate:v.plate,label:unitLabel(v),note:active.some(a=>a.vehicle_id===v.id)?"(possui conjunto)":undefined}))} value={vehicleId} onSelect={id=>{setVehicleId(id);const ex=active.find(a=>a.vehicle_id===id);setImplements([ex?.implement_ids[0] || "",ex?.implement_ids[1] || "",ex?.implement_ids[2] || ""]);if(ex){setDriverId(ex.driver_profile_id || "");setDriverName(person(ex.driver_profile_id)?.full_name || "");}}}/>{existing && <p className="text-xs text-warning">Esta placa já possui conjunto. Ao salvar, o conjunto será substituído pelo informado abaixo.</p>}</div>
        <div className="space-y-1"><Label>Motorista / Colaborador</Label><PersonSearchInput categories={["motorista","colaborador"]} placeholder="Buscar motorista ou colaborador..." selectedName={driverName || undefined} onSelect={p=>{setDriverId(p.id);setDriverName(p.full_name);}} onClear={()=>{setDriverId("");setDriverName("");}}/></div>
        {vehicleId && !["utilitario","passeio"].includes(category) && implementsIds.map((id,index)=><div key={index} className="space-y-1"><Label>{index+1}º Implemento</Label><Select value={id || "none"} onValueChange={value=>setImplements(p=>p.map((old,i)=>i===index?(value==="none"?"":value):old))}><SelectTrigger aria-label={`${index+1}º Implemento`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Sem implemento</SelectItem>{availableImplements.filter(v=>v.id===id || !implementsIds.includes(v.id)).map(v=><SelectItem key={v.id} value={v.id}>{maskPlate(v.plate)} — {unitLabel(v)}</SelectItem>)}</SelectContent></Select></div>)}
        <div className="space-y-1"><Label>Observações</Label><Input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        <Button className="w-full" disabled={saving || !canEdit} onClick={()=>void save()}><Link2 className="h-4 w-4"/>{saving?"Salvando...":"Salvar vinculação"}</Button>
      </div>
    </DialogContent></Dialog>
  </main></AdminLayout>;
}