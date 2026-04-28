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
import { Plus, Search, Check, UserPlus, Truck, User } from "lucide-react";
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
}

interface OptionItem {
  id: string; // profile.id (cliente) | vehicle.id (placa) | profile.id (motorista)
  label: string;
  sublabel?: string;
}

type DescontoTipo = "nenhum" | "diesel" | "outros";

export function ManualForecastDialog({ open, onOpenChange, onSaved }: ManualForecastDialogProps) {
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
  }, [open]);

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
      }))
    );
    setDrivers(
      (drvData || []).map((d: any) => ({
        id: d.id,
        label: d.full_name,
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

  const handleSave = async () => {
    if (!clienteId) return toast.error("Selecione o cliente");
    if (!vehicleId) return toast.error("Selecione a placa");
    if (!driverId) return toast.error("Selecione o motorista");
    if (!dataServico) return toast.error("Informe a data do serviço");
    if (pesoTon <= 0) return toast.error("Informe o peso em quilos");
    if (valorPorTon <= 0) return toast.error("Informe o valor por tonelada");
    if (descontoTipo === "outros" && !outrosDescricao.trim())
      return toast.error("Descreva o desconto");
    if (valorLiquido <= 0) return toast.error("Valor líquido deve ser maior que zero");

    setSaving(true);
    try {
      const metadata: Record<string, any> = {
        tipo: "manual",
        placa: selectedVehicle?.label,
        veiculo_id: vehicleId,
        motorista: selectedDriver?.label,
        motorista_id: driverId,
        peso_kg: parseFloat(pesoKg.replace(",", ".")),
        peso_ton: pesoTon,
        valor_por_ton: valorPorTon,
        valor_bruto: valorBruto,
        valor_desconto: valorDesconto,
        desconto: {
          tipo: descontoTipo,
          ...(descontoTipo === "diesel" && {
            litros: parseFloat(litros.replace(",", ".")) || 0,
            valor_litro: toNumber(valorLitro),
          }),
          ...(descontoTipo === "outros" && {
            descricao: outrosDescricao.trim(),
            valor: toNumber(outrosValor),
          }),
        },
      };

      const { error } = await supabase.from("previsoes_recebimento").insert({
        origem_tipo: "manual" as any,
        origem_id: crypto.randomUUID(),
        cliente_id: clienteId,
        valor: valorLiquido,
        data_prevista: dataServico,
        status: "pendente" as any,
        metadata,
      });

      if (error) throw error;

      toast.success("Previsão manual criada com sucesso!");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar previsão");
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
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2"
                      >
                        <span className={cn("truncate", !selectedCliente && "text-muted-foreground")}>
                          {selectedCliente?.label || "Buscar cliente..."}
                        </span>
                        <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Digite para buscar..." />
                        <CommandList>
                          <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                          <CommandGroup>
                            {clientes.map((c) => (
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
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2"
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
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Digite a placa..." />
                        <CommandList>
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
                          <CommandGroup>
                            {vehicles.map((v) => (
                              <CommandItem
                                key={v.id}
                                value={`${v.label} ${v.sublabel || ""}`}
                                onSelect={() => {
                                  setVehicleId(v.id);
                                  setVehiclePopoverOpen(false);
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
                        className="flex-1 min-w-0 justify-between font-normal h-9 text-xs px-2"
                      >
                        <span className={cn("truncate", !selectedDriver && "text-muted-foreground")}>
                          {selectedDriver?.label || "Buscar motorista..."}
                        </span>
                        <Search className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Digite o nome..." />
                        <CommandList>
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
                          <CommandGroup>
                            {drivers.map((d) => (
                              <CommandItem
                                key={d.id}
                                value={d.label}
                                onSelect={() => {
                                  setDriverId(d.id);
                                  setDriverPopoverOpen(false);
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

              {/* Valor líquido final */}
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Valor Líquido</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {formatCurrency(valorLiquido)}
                </span>
              </div>

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar Previsão"}
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
