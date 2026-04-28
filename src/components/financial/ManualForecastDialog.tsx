import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Search, Check, UserPlus, Truck, User, Trash2, ListPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getLocalDateISO } from "@/lib/date";
import { formatCurrency, maskCurrency, unmaskCurrency, maskName } from "@/lib/masks";
import { PersonCreateDialog } from "@/components/PersonEditDialog";

interface ManualForecastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  appendToLote?: { loteId: string; clienteId: string } | null;
}

interface OptionItem {
  id: string; // profile.id (cliente) | vehicle.id (placa) | profile.id (motorista)
  label: string;
  sublabel?: string;
  driverUserId?: string; // for vehicles: vehicles.driver_id (auth user_id)
  userId?: string; // for drivers: profiles.user_id
}

type DescontoTipo = "nenhum" | "diesel" | "outros";

interface LoteItem {
  id: string; // local UUID
  dataServico: string;
  vehicleId: string;
  placa: string;
  driverId: string;
  motorista: string;
  pesoKg: number;
  pesoTon: number;
  valorPorTon: number;
  valorBruto: number;
  descontoTipo: DescontoTipo;
  descontoDetalhe: Record<string, any>;
  valorDesconto: number;
  valorLiquido: number;
}

export function ManualForecastDialog({ open, onOpenChange, onSaved, appendToLote }: ManualForecastDialogProps) {
  const navigate = useNavigate();

  // Cliente
  const [clientes, setClientes] = useState<OptionItem[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [clienteId, setClienteId] = useState<string>("");
  const [createClienteOpen, setCreateClienteOpen] = useState(false);

  // Veículo (placa)
  const [vehicles, setVehicles] = useState<OptionItem[]>([]);
  const [vehiclePopoverOpen, setVehiclePopoverOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string>("");

  // Motorista
  const [drivers, setDrivers] = useState<OptionItem[]>([]);
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false);
  const [driverId, setDriverId] = useState<string>(""); // profile.id

  // Search queries (only show results after typing)
  const [clienteQuery, setClienteQuery] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [driverQuery, setDriverQuery] = useState("");

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filterByQuery = <T extends OptionItem>(items: T[], q: string): T[] => {
    const trimmed = q.trim();
    if (trimmed.length < 1) return [];
    const nq = norm(trimmed);
    return items.filter(
      (i) => norm(i.label).includes(nq) || (i.sublabel && norm(i.sublabel).includes(nq))
    );
  };

  // Campos do serviço
  const [dataServico, setDataServico] = useState<string>(getLocalDateISO());
  const [pesoKg, setPesoKg] = useState<string>("");
  const [valorTon, setValorTon] = useState<string>(""); // masked currency

  // Desconto
  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo>("nenhum");
  const [litros, setLitros] = useState<string>("");
  const [valorLitro, setValorLitro] = useState<string>(""); // masked currency
  const [outrosDescricao, setOutrosDescricao] = useState<string>("");
  const [outrosValor, setOutrosValor] = useState<string>(""); // masked currency

  const [saving, setSaving] = useState(false);

  // Reset form
  useEffect(() => {
    if (!open) return;
    setClienteId("");
    setVehicleId("");
    setDriverId("");
    setDataServico(getLocalDateISO());
    setPesoKg("");
    setValorTon("");
    setDescontoTipo("nenhum");
    setLitros("");
    setValorLitro("");
    setOutrosDescricao("");
    setOutrosValor("");
    setClienteQuery("");
    setVehicleQuery("");
    setDriverQuery("");
    setLote([]);
    setEditingLoteId(null);
  }, [open]);

  // Lote (batch) de serviços
  const [lote, setLote] = useState<LoteItem[]>([]);
  const [editingLoteId, setEditingLoteId] = useState<string | null>(null);

  const clearServiceFields = () => {
    setVehicleId("");
    setDriverId("");
    setPesoKg("");
    setValorTon("");
    setDescontoTipo("nenhum");
    setLitros("");
    setValorLitro("");
    setOutrosDescricao("");
    setOutrosValor("");
    setVehicleQuery("");
    setDriverQuery("");
    setEditingLoteId(null);
  };

  // Load options
  const loadAll = async () => {
    const [{ data: cliData }, { data: vehData }, { data: drvData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, razao_social, cnpj, category")
        .in("category", ["cliente"])
        .order("full_name"),
      supabase
        .from("vehicles")
        .select("id, plate, brand, model, driver_id")
        .eq("is_active", true)
        .order("plate"),
      supabase
        .from("profiles")
        .select("id, full_name, user_id, category")
        .eq("category", "motorista")
        .order("full_name"),
    ]);

    setClientes(
      (cliData || []).map((c: any) => ({
        id: c.id,
        label: c.razao_social || c.full_name,
        sublabel: c.cnpj || undefined,
      }))
    );
    setVehicles(
      (vehData || []).map((v: any) => ({
        id: v.id,
        label: v.plate,
        sublabel: [v.brand, v.model].filter(Boolean).join(" "),
        driverUserId: v.driver_id || undefined,
      }))
    );
    setDrivers(
      (drvData || []).map((d: any) => ({
        id: d.id,
        label: d.full_name,
        userId: d.user_id || undefined,
      }))
    );
  };

  useEffect(() => {
    if (open) loadAll();
  }, [open]);

  // Cálculos
  const pesoTon = useMemo(() => {
    const kg = parseFloat(pesoKg.replace(",", "."));
    return isNaN(kg) ? 0 : kg / 1000;
  }, [pesoKg]);

  const toNumber = (s: string) => Number(unmaskCurrency(s) || "0");

  const valorPorTon = useMemo(() => toNumber(valorTon), [valorTon]);

  const valorBruto = useMemo(() => pesoTon * valorPorTon, [pesoTon, valorPorTon]);

  const valorDesconto = useMemo(() => {
    if (descontoTipo === "diesel") {
      const l = parseFloat(litros.replace(",", "."));
      const vl = toNumber(valorLitro);
      return (isNaN(l) ? 0 : l) * vl;
    }
    if (descontoTipo === "outros") {
      return toNumber(outrosValor);
    }
    return 0;
  }, [descontoTipo, litros, valorLitro, outrosValor]);

  const valorLiquido = useMemo(
    () => Math.max(0, valorBruto - valorDesconto),
    [valorBruto, valorDesconto]
  );

  // Handlers para cadastros externos
  const handleCadastrarPlaca = () => {
    onOpenChange(false);
    navigate("/admin/vehicles");
  };
  const handleCadastrarMotorista = () => {
    onOpenChange(false);
    navigate("/admin/drivers");
  };

  const handleClienteCreated = async (createdUserId?: string) => {
    setCreateClienteOpen(false);
    await loadAll();
    if (createdUserId) {
      // Look up profile.id from user_id and select
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", createdUserId)
        .maybeSingle();
      if (data?.id) setClienteId(data.id);
    }
  };

  const selectedCliente = clientes.find((c) => c.id === clienteId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedDriver = drivers.find((d) => d.id === driverId);

  const buildCurrentItem = (): LoteItem | null => {
    if (!vehicleId) { toast.error("Selecione a placa"); return null; }
    if (!driverId) { toast.error("Selecione o motorista"); return null; }
    if (!dataServico) { toast.error("Informe a data do serviço"); return null; }
    if (pesoTon <= 0) { toast.error("Informe o peso em quilos"); return null; }
    if (valorPorTon <= 0) { toast.error("Informe o valor por tonelada"); return null; }
    if (descontoTipo === "outros" && !outrosDescricao.trim()) { toast.error("Descreva o desconto"); return null; }
    if (valorLiquido <= 0) { toast.error("Valor líquido deve ser maior que zero"); return null; }

    const descontoDetalhe: Record<string, any> = { tipo: descontoTipo };
    if (descontoTipo === "diesel") {
      descontoDetalhe.litros = parseFloat(litros.replace(",", ".")) || 0;
      descontoDetalhe.valor_litro = toNumber(valorLitro);
    }
    if (descontoTipo === "outros") {
      descontoDetalhe.descricao = outrosDescricao.trim();
      descontoDetalhe.valor = toNumber(outrosValor);
    }

    return {
      id: crypto.randomUUID(),
      dataServico,
      vehicleId,
      placa: selectedVehicle?.label || "",
      driverId,
      motorista: selectedDriver?.label || "",
      pesoKg: parseFloat(pesoKg.replace(",", ".")),
      pesoTon,
      valorPorTon,
      valorBruto,
      descontoTipo,
      descontoDetalhe,
      valorDesconto,
      valorLiquido,
    };
  };

  const handleAddToBatch = () => {
    if (!clienteId) return toast.error("Selecione o cliente");
    const item = buildCurrentItem();
    if (!item) return;
    if (editingLoteId) {
      setLote((prev) => prev.map((i) => (i.id === editingLoteId ? { ...item, id: editingLoteId } : i)));
      toast.success("Serviço atualizado no lote");
    } else {
      setLote((prev) => [...prev, item]);
      toast.success("Serviço adicionado ao lote");
    }
    clearServiceFields();
  };

  const handleEditLoteItem = (it: LoteItem) => {
    setEditingLoteId(it.id);
    setVehicleId(it.vehicleId);
    setDriverId(it.driverId);
    setDataServico(it.dataServico);
    setPesoKg(String(it.pesoKg).replace(".", ","));
    setValorTon(maskCurrency(String(Math.round(it.valorPorTon * 100))));
    setDescontoTipo(it.descontoTipo);
    if (it.descontoTipo === "diesel") {
      setLitros(String(it.descontoDetalhe.litros ?? "").replace(".", ","));
      setValorLitro(maskCurrency(String(Math.round((it.descontoDetalhe.valor_litro ?? 0) * 100))));
    } else {
      setLitros("");
      setValorLitro("");
    }
    if (it.descontoTipo === "outros") {
      setOutrosDescricao(it.descontoDetalhe.descricao ?? "");
      setOutrosValor(maskCurrency(String(Math.round((it.descontoDetalhe.valor ?? 0) * 100))));
    } else {
      setOutrosDescricao("");
      setOutrosValor("");
    }
  };

  const handleRemoveFromBatch = (id: string) => {
    if (editingLoteId === id) clearServiceFields();
    setLote((prev) => prev.filter((i) => i.id !== id));
  };

  const totalLote = useMemo(
    () => lote.reduce((sum, i) => sum + i.valorLiquido, 0),
    [lote]
  );

  const handleSave = async () => {
    if (!clienteId) return toast.error("Selecione o cliente");

    // Unified batch: include current form entry if user filled it without clicking "Add"
    const items: LoteItem[] = [...lote];
    const hasCurrentFilled = vehicleId || driverId || pesoKg || valorTon;
    if (hasCurrentFilled) {
      const current = buildCurrentItem();
      if (!current) return;
      if (editingLoteId) {
        const idx = items.findIndex((i) => i.id === editingLoteId);
        if (idx >= 0) items[idx] = { ...current, id: editingLoteId };
        else items.push(current);
      } else {
        items.push(current);
      }
    }

    if (items.length === 0) return toast.error("Adicione ao menos um serviço");

    setSaving(true);
    try {
      // Tag all rows with the same lote_id when there is more than one item
      const loteId = items.length > 1 ? crypto.randomUUID() : null;
      const rows = items.map((it) => ({
        origem_tipo: "manual" as any,
        origem_id: crypto.randomUUID(),
        cliente_id: clienteId,
        valor: it.valorLiquido,
        data_prevista: it.dataServico,
        status: "pendente" as any,
        metadata: {
          tipo: "manual",
          lote_id: loteId,
          lote_total: items.length,
          placa: it.placa,
          veiculo_id: it.vehicleId,
          motorista: it.motorista,
          motorista_id: it.driverId,
          peso_kg: it.pesoKg,
          peso_ton: it.pesoTon,
          valor_por_ton: it.valorPorTon,
          valor_bruto: it.valorBruto,
          valor_desconto: it.valorDesconto,
          desconto: it.descontoDetalhe,
        },
      }));

      const { error } = await supabase.from("previsoes_recebimento").insert(rows);
      if (error) throw error;

      toast.success(
        items.length === 1
          ? "Previsão manual criada com sucesso!"
          : `${items.length} previsões criadas com sucesso!`
      );
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar previsões");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-1.5rem)] max-h-[92vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">Nova Previsão Manual</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh]">
            <div className="px-4 pb-4 space-y-3">
              {/* Cliente */}
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <div className="flex gap-1.5">
                  <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2.5 border-input hover:border-primary/40 hover:bg-background focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:border-primary/50 transition-colors"
                      >
                        <span className={cn("truncate", !selectedCliente && "text-muted-foreground")}>
                          {selectedCliente?.label || "Buscar cliente..."}
                        </span>
                        <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width] shadow-lg border-border/60 rounded-lg overflow-hidden max-w-[calc(100vw-2rem)]" align="start" sideOffset={4}>
                      <Command shouldFilter={false} className="bg-popover">
                        <CommandInput className="h-10 text-xs border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none w-full max-w-full"
                          placeholder="Digite para buscar..."
                          value={clienteQuery}
                          onValueChange={setClienteQuery}
                        />
                        <CommandList>
                          {clienteQuery.trim().length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                              Digite para buscar clientes
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                              <CommandGroup className="p-1.5">
                                {filterByQuery(clientes, clienteQuery).map((c) => (
                                  <CommandItem
                                    key={c.id}
                                    value={`${c.label} ${c.sublabel || ""}`}
                                    onSelect={() => {
                                      setClienteId(c.id);
                                      setClientePopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        clienteId === c.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm">{c.label}</span>
                                      {c.sublabel && (
                                        <span className="text-[10px] text-muted-foreground">{c.sublabel}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setCreateClienteOpen(true)}
                    title="Cadastrar novo cliente"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Data */}
              <div className="space-y-1">
                <Label className="text-xs">Data do Serviço</Label>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={dataServico}
                  onChange={(e) => setDataServico(e.target.value)}
                />
              </div>

              {/* Placa */}
              <div className="space-y-1">
                <Label className="text-xs">Placa</Label>
                <div className="flex gap-1.5">
                  <Popover open={vehiclePopoverOpen} onOpenChange={setVehiclePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2.5 border-input hover:border-primary/40 hover:bg-background focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:border-primary/50 transition-colors"
                      >
                        <span className={cn("truncate", !selectedVehicle && "text-muted-foreground")}>
                          {selectedVehicle?.label || "Buscar placa..."}
                          {selectedVehicle?.sublabel && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {selectedVehicle.sublabel}
                            </span>
                          )}
                        </span>
                        <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width] shadow-lg border-border/60 rounded-lg overflow-hidden max-w-[calc(100vw-2rem)]" align="start" sideOffset={4}>
                      <Command shouldFilter={false} className="bg-popover">
                        <CommandInput className="h-10 text-xs border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none w-full max-w-full"
                          placeholder="Digite a placa..."
                          value={vehicleQuery}
                          onValueChange={setVehicleQuery}
                        />
                        <CommandList>
                          {vehicleQuery.trim().length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                              Digite para buscar placas
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>
                                <div className="p-2 space-y-2">
                                  <p className="text-xs text-muted-foreground">Placa não cadastrada.</p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full gap-1"
                                    onClick={handleCadastrarPlaca}
                                  >
                                    <Plus className="h-3 w-3" /> Cadastrar veículo
                                  </Button>
                                </div>
                              </CommandEmpty>
                              <CommandGroup className="p-1.5">
                                {filterByQuery(vehicles, vehicleQuery).map((v) => (
                                  <CommandItem
                                    key={v.id}
                                    value={`${v.label} ${v.sublabel || ""}`}
                                    onSelect={() => {
                                      setVehicleId(v.id);
                                      setVehiclePopoverOpen(false);
                                      // Auto-link driver based on vehicle's driver_id (auth user_id)
                                      if (v.driverUserId && !driverId) {
                                        const matched = drivers.find((d) => d.userId === v.driverUserId);
                                        if (matched) setDriverId(matched.id);
                                      }
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        vehicleId === v.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm font-mono">{v.label}</span>
                                      {v.sublabel && (
                                        <span className="text-[10px] text-muted-foreground">{v.sublabel}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleCadastrarPlaca}
                    title="Cadastrar veículo"
                  >
                    <Truck className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Motorista */}
              <div className="space-y-1">
                <Label className="text-xs">Motorista</Label>
                <div className="flex gap-1.5">
                  <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2.5 border-input hover:border-primary/40 hover:bg-background focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:border-primary/50 transition-colors"
                      >
                        <span className={cn("truncate", !selectedDriver && "text-muted-foreground")}>
                          {selectedDriver?.label || "Buscar motorista..."}
                        </span>
                        <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width] shadow-lg border-border/60 rounded-lg overflow-hidden max-w-[calc(100vw-2rem)]" align="start" sideOffset={4}>
                      <Command shouldFilter={false} className="bg-popover">
                        <CommandInput className="h-10 text-xs border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none w-full max-w-full"
                          placeholder="Digite o nome..."
                          value={driverQuery}
                          onValueChange={setDriverQuery}
                        />
                        <CommandList>
                          {driverQuery.trim().length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                              Digite para buscar motoristas
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>
                                <div className="p-2 space-y-2">
                                  <p className="text-xs text-muted-foreground">Motorista não cadastrado.</p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full gap-1"
                                    onClick={handleCadastrarMotorista}
                                  >
                                    <Plus className="h-3 w-3" /> Cadastrar motorista
                                  </Button>
                                </div>
                              </CommandEmpty>
                              <CommandGroup className="p-1.5">
                                {filterByQuery(drivers, driverQuery).map((d) => (
                                  <CommandItem
                                    key={d.id}
                                    value={d.label}
                                    onSelect={() => {
                                      setDriverId(d.id);
                                      setDriverPopoverOpen(false);
                                      // Auto-link vehicle based on driver's user_id
                                      if (d.userId && !vehicleId) {
                                        const matched = vehicles.find((v) => v.driverUserId === d.userId);
                                        if (matched) setVehicleId(matched.id);
                                      }
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        driverId === d.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="text-sm">{d.label}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleCadastrarMotorista}
                    title="Cadastrar motorista"
                  >
                    <User className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Peso e Valor/Ton */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Peso (kg)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={pesoKg}
                    onChange={(e) => setPesoKg(e.target.value.replace(/[^\d,.]/g, ""))}
                  />
                  {pesoTon > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      = {pesoTon.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} ton
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor por Tonelada</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={valorTon}
                    onChange={(e) => setValorTon(maskCurrency(e.target.value))}
                  />
                </div>
              </div>

              {/* Valor bruto preview */}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Valor Bruto</span>
                <span className="font-mono text-sm font-semibold">{formatCurrency(valorBruto)}</span>
              </div>

              {/* Desconto */}
              <div className="space-y-2">
                <Label className="text-xs">Tipo de Desconto</Label>
                <Select value={descontoTipo} onValueChange={(v) => setDescontoTipo(v as DescontoTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem desconto</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>

                {descontoTipo === "diesel" && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-md border border-border bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade (L)</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        value={litros}
                        onChange={(e) => setLitros(e.target.value.replace(/[^\d,.]/g, ""))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor por Litro</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={valorLitro}
                        onChange={(e) => setValorLitro(maskCurrency(e.target.value))}
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total do desconto</span>
                      <span className="font-mono font-semibold text-destructive">
                        − {formatCurrency(valorDesconto)}
                      </span>
                    </div>
                  </div>
                )}

                {descontoTipo === "outros" && (
                  <div className="space-y-2 p-3 rounded-md border border-border bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Textarea
                        rows={2}
                        placeholder="Ex: Adiantamento, pedágio, etc."
                        value={outrosDescricao}
                        onChange={(e) => setOutrosDescricao(maskName(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor do Desconto</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="R$ 0,00"
                        value={outrosValor}
                        onChange={(e) => setOutrosValor(maskCurrency(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Valor líquido do serviço atual */}
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Valor Líquido</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {formatCurrency(valorLiquido)}
                </span>
              </div>

              {/* Botão adicionar/atualizar no lote */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 border-dashed"
                  onClick={handleAddToBatch}
                >
                  <ListPlus className="h-4 w-4" />
                  {editingLoteId ? "Atualizar serviço no lote" : "Adicionar serviço ao lote"}
                </Button>
                {editingLoteId && (
                  <Button type="button" variant="ghost" onClick={clearServiceFields}>
                    Cancelar
                  </Button>
                )}
              </div>

              {/* Lista do lote */}
              {lote.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Lote ({lote.length} {lote.length === 1 ? "serviço" : "serviços"})
                    </span>
                    <span className="font-mono text-xs font-semibold text-primary">
                      {formatCurrency(totalLote)}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {lote.map((it, idx) => {
                      const isEditing = editingLoteId === it.id;
                      return (
                        <div
                          key={it.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                            isEditing
                              ? "border-primary/60 bg-primary/5"
                              : "border-border/60 bg-background hover:border-primary/40 hover:bg-muted/40 cursor-pointer"
                          )}
                          onClick={() => !isEditing && handleEditLoteItem(it)}
                          role="button"
                          title={isEditing ? "Editando..." : "Clique para editar"}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-mono">#{idx + 1}</span>
                              <span>
                                {new Date(it.dataServico + "T12:00:00").toLocaleDateString("pt-BR")}
                              </span>
                              <span className="font-mono">{it.placa}</span>
                              {isEditing && <span className="text-primary font-semibold">editando</span>}
                            </div>
                            <div className="text-xs truncate">
                              {it.motorista} · {it.pesoTon.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} t
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold shrink-0">
                            {formatCurrency(it.valorLiquido)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromBatch(it.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving
                  ? "Salvando..."
                  : (() => {
                      const extra = (vehicleId || pesoKg) && !editingLoteId ? 1 : 0;
                      const total = lote.length + extra;
                      return total > 1 ? `Salvar ${total} previsões` : "Salvar Previsão";
                    })()}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <PersonCreateDialog
        open={createClienteOpen}
        onOpenChange={setCreateClienteOpen}
        onCreated={handleClienteCreated}
        defaultCategory="cliente"
      />
    </>
  );
}
