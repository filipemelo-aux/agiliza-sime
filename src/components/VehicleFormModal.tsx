import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { personDisplayName } from "@/lib/personName";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { Plus } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehicleDocumentsTab } from "@/components/fleet/VehicleDocumentsTab";
import { VehicleAlienacaoParcelas } from "@/components/fleet/VehicleAlienacaoParcelas";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { maskPlateInput, unmaskPlate, maskRenavam, maskYear, maskName, validatePlate, validateRenavam } from "@/lib/masks";
import { UNIT_CATEGORIES, unitCategory } from "@/lib/vehicleUnits";
const TIPOS_ALIENACAO = ["Financiamento", "Consórcio", "Contrato de Custódia", "Outros"] as const;
const emptyVehicle = {
 plate: "", renavam: "", category: "", vehicleType: "truck", brand: "", model: "", year: "", chassis: "", tare: "", capacity: "",
 anttNumber: "", cargoType: "", ownerId: "", fleetType: "terceiros", intervaloRevisaoKm: "", proximaRevisaoKm: "",
 alienado: false, tipoAlienacao: "", instituicaoFinanceira: "", instituicaoFinanceiraId: "", observacoesAlienacao: "", registrationPending: false,
};
interface VehicleFormModalProps { open: boolean; onOpenChange: (open: boolean) => void; vehicleId?: string | null; onSaved: () => void; defaultDriverId?: string | null; }
export function VehicleFormModal({ open, onOpenChange, vehicleId, onSaved }: VehicleFormModalProps) {
 const isEdit = !!vehicleId;
 const [loading, setLoading] = useState(false);
 const lock = useRef(false);
 const [fetching, setFetching] = useState(false);
 const [errors, setErrors] = useState<Record<string,string>>({});
 const [form, setForm] = useState(emptyVehicle);
 const [ownerName, setOwnerName] = useState("");
 const [personCreateOpen, setPersonCreateOpen] = useState(false);
 useEffect(() => {
  if (!open) return;
  setErrors({}); setOwnerName(""); setForm(emptyVehicle);
  if (!vehicleId) return;
  let cancelled=false; setFetching(true);
  (async () => {
   try {
    const {data,error}=await supabase.from("vehicles").select("*").eq("id",vehicleId).single();
    if(error || !data) throw error || new Error("Veículo não encontrado");
    if(cancelled) return;
    setForm({ plate:maskPlateInput(data.plate),renavam:data.renavam,category:unitCategory(data),vehicleType:data.vehicle_type,
     brand:data.registration_pending ? "" : data.brand,model:data.registration_pending ? "" : data.model,year:data.registration_pending ? "" : String(data.year),
     chassis:data.chassis || "",tare:data.tare_kg?.toString() || "",capacity:data.capacity_kg?.toString() || "",anttNumber:data.antt_number || "",cargoType:data.cargo_type || "",
     ownerId:data.owner_id || "",fleetType:data.fleet_type,intervaloRevisaoKm:data.intervalo_revisao_km?.toString() || "",proximaRevisaoKm:data.proxima_revisao_km?.toString() || "",
     alienado:data.alienado,tipoAlienacao:data.tipo_alienacao || "",instituicaoFinanceira:data.instituicao_financeira || "",instituicaoFinanceiraId:data.instituicao_financeira_id || "",
     observacoesAlienacao:data.observacoes_alienacao || "",registrationPending:data.registration_pending });
    if(data.owner_id){
     const {data:names,error:err}=await supabase.from("profiles").select("id,full_name,razao_social").or(`id.eq.${data.owner_id},user_id.eq.${data.owner_id}`).limit(1);
     if(err) throw err;
     if(!cancelled) setOwnerName(names?.[0]?.razao_social || names?.[0]?.full_name || "");
    }
   }catch(e){if(!cancelled) toast.error(e instanceof Error ? e.message : "Erro ao carregar veículo");}
   finally{if(!cancelled) setFetching(false);}
  })();
  return () => { cancelled=true; };
 },[open,vehicleId]);
 const handleChange=(e:React.ChangeEvent<HTMLInputElement>)=>{
  const {name,value}=e.target;
  const masked=name==="plate"?maskPlateInput(value):name==="renavam"?maskRenavam(value):name==="year"?maskYear(value):["brand","model"].includes(name)?maskName(value):value;
  setForm(p=>({...p,[name]:masked})); setErrors(p=>({...p,[name]:""}));
 };
 const handleSubmit=async()=>{
  if(lock.current) return;
  const err:Record<string,string>={};
  if(!validatePlate(form.plate)) err.plate="Placa inválida";
  if(!validateRenavam(form.renavam)) err.renavam="Informe o RENAVAM com 11 dígitos";
  if(!form.category) err.category="Selecione a categoria";
  if(!form.brand.trim()) err.brand="Marca obrigatória";
  if(!form.model.trim()) err.model="Modelo obrigatório";
   if(!Number.isInteger(Number(form.year)) || Number(form.year)<1900 || Number(form.year)>new Date().getFullYear()+1) err.year="Ano inválido";
  if([form.tare,form.capacity].some(v=>v && (!Number.isFinite(Number(v)) || Number(v)<0))) err.weights="Informe pesos válidos";
  setErrors(err); if(Object.keys(err).length) return;
  lock.current=true; setLoading(true);
  try{
   const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error("Não autenticado");
   const payload={plate:unmaskPlate(form.plate),renavam:form.renavam,unit_category:form.category,
    vehicle_type:form.vehicleType as "truck", brand:form.brand.trim(),model:form.model.trim(),year:Number(form.year),chassis:form.chassis.toUpperCase() || null,
    tare_kg:form.tare?Number(form.tare):null,capacity_kg:form.capacity?Number(form.capacity):null,antt_number:form.anttNumber || null,cargo_type:form.cargoType || null,
    owner_id:form.ownerId || null,fleet_type:form.fleetType,registration_pending:false,
    intervalo_revisao_km:form.intervaloRevisaoKm?Number(form.intervaloRevisaoKm):null,proxima_revisao_km:form.proximaRevisaoKm?Number(form.proximaRevisaoKm):null,
    alienado:form.alienado,tipo_alienacao:form.alienado && form.tipoAlienacao?form.tipoAlienacao as typeof TIPOS_ALIENACAO[number]:null,
    instituicao_financeira:form.alienado?form.instituicaoFinanceira || null:null,instituicao_financeira_id:form.alienado?form.instituicaoFinanceiraId || null:null,
    observacoes_alienacao:form.alienado?form.observacoesAlienacao || null:null};
   const query=vehicleId?supabase.from("vehicles").update(payload).eq("id",vehicleId):supabase.from("vehicles").insert({...payload,user_id:user.id});
   const {data,error}=await query.select("id").single(); if(error || !data) throw error || new Error("O cadastro não foi gravado");
   const {data:check,error:checkError}=await supabase.from("vehicles").select("plate,unit_category").eq("id",data.id).single();
   if(checkError || check?.plate!==payload.plate || check.unit_category!==payload.unit_category) throw new Error("Não foi possível confirmar a gravação. Atualize a lista antes de tentar novamente.");
   onSaved(); onOpenChange(false);
  }catch(e){toast.error((e as {message?:string})?.message || "Não foi possível salvar o veículo");}
  finally{setLoading(false);lock.current=false;}
 };
 const changeCategory=(category:string)=>setForm(p=>({...p,category,vehicleType:category==="cavalo"?"carreta":category==="rigido"?"truck":["utilitario","passeio"].includes(category)?category:"carreta"}));
 const selectOwner=async(id:string,name:string)=>{
  setForm(f=>({...f,ownerId:id}));setOwnerName(name);
  const {data,error}=await supabase.from("fiscal_establishments").select("id").eq("profile_id",id).limit(1);
  if(error){toast.error(error.message);return;}
  setForm(f=>f.ownerId===id?{...f,fleetType:data?.length?"propria":"terceiros"}:f);
 };
 return <>
 <Dialog open={open} onOpenChange={v=>!loading && onOpenChange(v)}>
 <DialogContent className="max-w-2xl max-h-[90vh]">
 <DialogHeader><DialogTitle>{isEdit?"Editar Veículo":"Novo Veículo"}</DialogTitle></DialogHeader>
 {fetching?<p className="text-muted-foreground">Carregando...</p>:<>
 <Tabs defaultValue="cadastro">
 <TabsList className="grid w-full grid-cols-3 h-9"><TabsTrigger value="cadastro" className="text-xs">Cadastro</TabsTrigger><TabsTrigger value="alienacao" className="text-xs">Alienação e Crédito</TabsTrigger><TabsTrigger value="documentos" className="text-xs">Documentação e Taxas</TabsTrigger></TabsList>
 <TabsContent value="cadastro" className="space-y-3 mt-3">
 {form.registrationPending && <p className="text-xs text-warning">Placa preservada do conjunto anterior. Complete marca, modelo e ano.</p>}
 <div className="space-y-1"><Label>Categoria *</Label><Select value={form.category} onValueChange={changeCategory}><SelectTrigger aria-label="Categoria"><SelectValue placeholder="Selecione a categoria"/></SelectTrigger><SelectContent>{UNIT_CATEGORIES.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>{errors.category && <p className="text-xs text-destructive">{errors.category}</p>}</div>
 <div className="grid grid-cols-2 gap-3">
 {[{name:"plate",label:"Placa *",placeholder:"ABC-1234",maxLength:8},{name:"renavam",label:"RENAVAM *",placeholder:"00000000000",maxLength:11},{name:"brand",label:"Marca *"},{name:"model",label:"Modelo *"},{name:"year",label:"Ano *",maxLength:4},{name:"chassis",label:"Chassi",maxLength:17}].map(f=><div key={f.name} className="space-y-1"><Label htmlFor={`vehicle-${f.name}`} className="text-xs">{f.label}</Label><Input id={`vehicle-${f.name}`} name={f.name} value={String(form[f.name as keyof typeof form])} placeholder={f.placeholder} maxLength={f.maxLength} onChange={handleChange}/>{errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}</div>)}
 <div className="space-y-1"><Label className="text-xs">RNTRC</Label><Input name="anttNumber" value={form.anttNumber} onChange={handleChange}/></div>
 <div className="space-y-1"><Label className="text-xs">Carroceria</Label><Select value={form.cargoType || "none"} onValueChange={v=>setForm(p=>({...p,cargoType:v==="none"?"":v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[{value:"none",label:"Não se aplica"},...(["Aberta","Baú","Caçamba","Graneleiro","Tanque","Sider","Plataforma"].map(label=>({value:label.toLowerCase(),label})))].map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
 <div className="space-y-1"><Label className="text-xs">Tara (kg)</Label><Input name="tare" type="number" min="0" value={form.tare} onChange={handleChange}/></div>
 <div className="space-y-1"><Label className="text-xs">Capacidade (kg)</Label><Input name="capacity" type="number" min="0" value={form.capacity} onChange={handleChange}/></div>
 </div>{errors.weights && <p className="text-xs text-destructive">{errors.weights}</p>}
 <Separator/>
 <div className="space-y-1"><Label className="text-xs">Proprietário</Label><PersonSearchInput categories={["proprietario"]} placeholder="Buscar proprietário..." selectedName={ownerName || undefined} onSelect={p=>void selectOwner(p.id,personDisplayName(p))} onClear={()=>{setForm(f=>({...f,ownerId:""}));setOwnerName("");}} endAction={<Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Cadastrar proprietário" title="Cadastrar proprietário" onClick={()=>setPersonCreateOpen(true)}><Plus className="h-4 w-4"/></Button>}/></div>
 <div className="space-y-1"><Label className="text-xs">Tipo de Frota</Label><RadioGroup value={form.fleetType} onValueChange={fleetType=>setForm(p=>({...p,fleetType}))} className="flex gap-4">{[{value:"propria",label:"Frota Própria"},{value:"terceiros",label:"Frota Terceiros"}].map(f=><div key={f.value} className="flex items-center gap-2"><RadioGroupItem id={`fleet-${f.value}`} value={f.value}/><Label htmlFor={`fleet-${f.value}`} className="text-xs">{f.label}</Label></div>)}</RadioGroup></div>
 {form.fleetType==="propria" && <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Intervalo de Revisão (KM)</Label><Input type="number" name="intervaloRevisaoKm" value={form.intervaloRevisaoKm} onChange={handleChange}/></div><div><Label className="text-xs">Próxima Revisão (KM)</Label><Input type="number" name="proximaRevisaoKm" value={form.proximaRevisaoKm} onChange={handleChange}/></div></div>}
 </TabsContent>
                    <TabsContent value="alienacao" className="space-y-3 mt-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="veiculo-alienado"
                          checked={form.alienado}
                          onCheckedChange={(checked) => {
                            const isChecked = !!checked;
                            setForm((p) => ({
                              ...p,
                              alienado: isChecked,
                              ...(isChecked ? {} : { tipoAlienacao: "", instituicaoFinanceira: "", observacoesAlienacao: "" }),
                            }));
                          }}
                        />
                        <Label htmlFor="veiculo-alienado" className="text-sm font-normal cursor-pointer">
                          Veículo Alienado?
                        </Label>
                      </div>

                      {form.alienado && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Tipo de Alienação</Label>
                              <Select
                                value={form.tipoAlienacao}
                                onValueChange={(v) => setForm((p) => ({ ...p, tipoAlienacao: v }))}
                              >
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {TIPOS_ALIENACAO.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Instituição Financeira</Label>
                              <PersonSearchInput
                                categories={["banco", "fornecedor", "cliente", "proprietario"]}
                                placeholder="Buscar banco / credor..."
                                selectedName={form.instituicaoFinanceira || undefined}
                                onSelect={(p) => setForm((prev) => ({
                                  ...prev,
                                  instituicaoFinanceiraId: p.id,
                                  instituicaoFinanceira: personDisplayName(p),
                                }))}
                                onClear={() => setForm((prev) => ({ ...prev, instituicaoFinanceiraId: "", instituicaoFinanceira: "" }))}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Observações</Label>
                            <Textarea
                              rows={3}
                              placeholder="Nº do contrato, parcelas, prazo..."
                              value={form.observacoesAlienacao}
                              onChange={(e) => setForm((p) => ({ ...p, observacoesAlienacao: e.target.value }))}
                            />
                          </div>
                          <VehicleAlienacaoParcelas
                            vehicleId={vehicleId}
                            vehiclePlate={form.plate}
                            tipoAlienacao={form.tipoAlienacao}
                            instituicaoFinanceiraId={form.instituicaoFinanceiraId}
                            instituicaoFinanceiraNome={form.instituicaoFinanceira}
                          />
                        </div>
                      )}

                    </TabsContent>

                    <TabsContent value="documentos" className="mt-3">
                      <VehicleDocumentsTab vehicleId={vehicleId} vehiclePlate={form.plate} />
                    </TabsContent>
                    </Tabs>


 <Button className="w-full" onClick={handleSubmit} disabled={loading}>{loading?"Salvando...":isEdit?"Salvar Alterações":"Cadastrar Veículo"}</Button>
 </>}
 </DialogContent></Dialog>
 <PersonCreateDialog open={personCreateOpen} onOpenChange={setPersonCreateOpen} defaultCategory="proprietario" onCreated={async uid=>{
  if(!uid) return;
  const {data,error}=await supabase.from("profiles").select("id,full_name,razao_social").or(`id.eq.${uid},user_id.eq.${uid}`).limit(1);
  if(error || !data?.[0]){toast.error("Não foi possível selecionar o proprietário criado.");return;}
  setForm(p=>({...p,ownerId:data[0].id}));setOwnerName(data[0].razao_social || data[0].full_name);
 }}/>
 </>;
}
