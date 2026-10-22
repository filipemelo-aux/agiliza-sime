import { useEffect, useRef, useState } from "react";
import { Link2, Pencil, Plus, Unlink, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "@/lib/notice";
import { assignmentValidation, isImplement, unitCategory, unitLabel } from "@/lib/vehicleUnits";
import { maskPlate, maskDocument } from "@/lib/masks";
import { matchesText } from "@/lib/search";
import type { Tables } from "@/integrations/supabase/types";

type Assignment = Tables<"vehicle_assignments">;
type Vehicle = Tables<"vehicles">;
type Person = Pick<Tables<"profiles">,"id"|"full_name"|"cnpj">;
export default function AdminVehicleAssignments() {
  const { canEdit, hasAdminAccess, loading: roleLoading } = useUserRole();
  const { confirm, ConfirmDialog } = useConfirmDialog();
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
    }catch(e){toast.error(e instanceof Error?e.message:"Erro ao carregar vinculações");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(!roleLoading && hasAdminAccess) void load();},[roleLoading,hasAdminAccess]);
  const vehicle=(id:string)=>vehicles.find(v=>v.id===id);
  const person=(id:string|null)=>people.find(p=>p.id===id);
  const current=rows.find(r=>selected.has(r.id));
  const active=rows.filter(r=>!r.ended_at && r.id!==editing?.id);
  const availableVehicles=vehicles.filter(v=>v.is_active!==false && !isImplement(v) && !active.some(a=>a.vehicle_id===v.id));
  const availableImplements=vehicles.filter(v=>v.is_active!==false && isImplement(v) && !active.some(a=>a.implement_ids.includes(v.id)));
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
      const {data:id,error}=await supabase.rpc("save_vehicle_assignment",{_vehicle_id:vehicleId,_driver_profile_id:driverId || undefined,_implement_ids:ids,_previous_id:editing?.id,_notes:notes});
      if(error || !id) throw error || new Error("Vinculação não gravada");
      const {data:check,error:readError}=await supabase.from("vehicle_assignments").select("*").eq("id",id).single();
      if(readError || !check || check.ended_at || check.vehicle_id!==vehicleId || check.driver_profile_id!==(driverId || null) || check.implement_ids.join()!==ids.join()) throw new Error("Não foi possível confirmar a gravação. Atualize a lista antes de tentar novamente.");
      await load();setOpen(false);
    }catch(e){toast.error(e instanceof Error?e.message:(e as {message?:string})?.message || "Erro ao salvar vinculação");}
    finally{lock.current=false;setSaving(false);}
  };
  const end=async()=>{
    if(!current || !canEdit || lock.current) return;
    if(!await confirm({title:"Desengatar conjunto?",description:`Encerrar a vinculação de ${maskPlate(vehicle(current.vehicle_id)?.plate || "")}? O histórico será preservado.`,confirmText:"Desengatar"})) return;
    lock.current=true;setSaving(true);
    try{
      const {error}=await supabase.rpc("end_vehicle_assignment",{_id:current.id});if(error) throw error;
      const {data,error:readError}=await supabase.from("vehicle_assignments").select("ended_at").eq("id",current.id).single();
      if(readError || !data?.ended_at) throw new Error("Não foi possível confirmar o encerramento.");
      await load();
    }catch(e){toast.error((e as {message?:string})?.message || "Erro ao desengatar conjunto");}
    finally{lock.current=false;setSaving(false);}
  };
  const filtered=rows.filter(r=>(status==="all" || (status==="active"?!r.ended_at:!!r.ended_at)) && (!search || matchesText([vehicle(r.vehicle_id)?.plate,person(r.driver_profile_id)?.full_name,...r.implement_ids.map(id=>vehicle(id)?.plate)].join(" "),search)));
  const date=(v:string|null)=>v?new Date(v).toLocaleString("pt-BR"):"—";
  const columns:DataGridColumn<Assignment>[]=[
    {key:"plate",header:"Tração / Veículo",width:"150px",cell:r=><div><span className="font-medium">{maskPlate(vehicle(r.vehicle_id)?.plate || "")}</span><div className="text-[10px] text-muted-foreground">{unitLabel(vehicle(r.vehicle_id) || {})}</div></div>},
    {key:"driver",header:"Motorista / Colaborador",cell:r=><div>{person(r.driver_profile_id)?.full_name || "—"}{person(r.driver_profile_id)?.cnpj && <div className="text-[10px] text-muted-foreground">{maskDocument(person(r.driver_profile_id)?.cnpj)}</div>}</div>},
    {key:"implements",header:"Implementos",cell:r=>r.implement_ids.length?<div className="space-y-1">{r.implement_ids.map(id=><div key={id}>{maskPlate(vehicle(id)?.plate || "")} <span className="text-[10px] text-muted-foreground">{unitLabel(vehicle(id) || {})}</span></div>)}</div>:"—"},
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
      {key:"end",label:"Desengatar conjunto",icon:Unlink,mode:"single",disabled:!canEdit || saving || !!current?.ended_at,onClick:()=>void end()},
      {key:"refresh",label:"Atualizar",icon:RefreshCw,mode:"always",disabled:saving,onClick:()=>void load()},
    ]}/>
    <DataGrid rows={filtered} columns={columns} rowId={r=>r.id} selected={selected} onSelectedChange={setSelected} loading={loading} minWidth={950} emptyMessage="Nenhuma vinculação encontrada." footer={<span className="text-xs text-muted-foreground">{filtered.length} vinculação(ões)</span>}/>
    <Dialog open={open} onOpenChange={v=>!saving && setOpen(v)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing?"Trocar vinculação":"Nova vinculação"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Tração / Veículo *</Label><Select value={vehicleId} onValueChange={id=>{setVehicleId(id);setImplements(["","",""]);}}><SelectTrigger aria-label="Tração / Veículo"><SelectValue placeholder="Selecione a placa"/></SelectTrigger><SelectContent>{availableVehicles.map(v=><SelectItem key={v.id} value={v.id}>{maskPlate(v.plate)} — {unitLabel(v)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Motorista / Colaborador</Label><PersonSearchInput categories={["motorista","colaborador"]} placeholder="Buscar motorista ou colaborador..." selectedName={driverName || undefined} onSelect={p=>{setDriverId(p.id);setDriverName(p.full_name);}} onClear={()=>{setDriverId("");setDriverName("");}}/></div>
        {vehicleId && !["utilitario","passeio"].includes(category) && implementsIds.map((id,index)=><div key={index} className="space-y-1"><Label>{index+1}º Implemento</Label><Select value={id || "none"} onValueChange={value=>setImplements(p=>p.map((old,i)=>i===index?(value==="none"?"":value):old))}><SelectTrigger aria-label={`${index+1}º Implemento`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Sem implemento</SelectItem>{availableImplements.filter(v=>v.id===id || !implementsIds.includes(v.id)).map(v=><SelectItem key={v.id} value={v.id}>{maskPlate(v.plate)} — {unitLabel(v)}</SelectItem>)}</SelectContent></Select></div>)}
        <div className="space-y-1"><Label>Observações</Label><Input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        <Button className="w-full" disabled={saving || !canEdit} onClick={()=>void save()}><Link2 className="h-4 w-4"/>{saving?"Salvando...":"Salvar vinculação"}</Button>
      </div>
    </DialogContent></Dialog>
    <ConfirmDialog/>
  </main></AdminLayout>;
}