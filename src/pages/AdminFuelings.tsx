import { useState, useEffect } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, DollarSign, Search, Loader2, Fuel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format } from "date-fns";
import { FuelingFormDialog } from "@/components/fueling/FuelingFormDialog";
import { GeneratePayablesDialog } from "@/components/fueling/GeneratePayablesDialog";
import { formatCurrency } from "@/lib/masks";

const FUEL_LABELS: Record<string, string> = {
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla32: "Arla 32",
};

const STATUS_FAT: Record<string, { label: string; variant: "default" | "outline" }> = {
  nao_faturado: { label: "Não Faturado", variant: "outline" },
  faturado: { label: "Faturado", variant: "default" },
};

export default function AdminFuelings() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { user } = useUserRole();
  const [items, setItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").eq("type", "matriz").limit(1).maybeSingle();
    const eid = estab?.id || "";
    setEmpresaId(eid);

    const [{ data: fData }, { data: vData }] = await Promise.all([
      supabase.from("fuelings").select("*").is("deleted_at", null).order("data_abastecimento", { ascending: false }),
      supabase.from("vehicles").select("id, plate"),
    ]);

    setItems((fData as any) || []);
    const vMap = new Map<string, string>();
    (vData || []).forEach((v: any) => vMap.set(v.id, v.plate));
    setVehicles(vMap);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (item: any) => {
    if (!await confirm({ title: "Excluir abastecimento", description: "Excluir este abastecimento?", variant: "destructive", confirmLabel: "Excluir" })) return;
    const { error } = await supabase.from("fuelings").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    fetchData();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const unfatured = filtered.filter(i => i.status_faturamento === "nao_faturado");
    if (selected.size === unfatured.length && unfatured.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unfatured.map(i => i.id)));
    }
  };

  const filtered = items.filter(i => {
    const matchSearch = !search ||
      (vehicles.get(i.veiculo_id) || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.posto_combustivel || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status_faturamento === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalValue = filtered.reduce((s, i) => s + Number(i.valor_total), 0);
  const totalLiters = filtered.reduce((s, i) => s + Number(i.quantidade_litros), 0);
  const selectableItems = filtered.filter(i => i.status_faturamento === "nao_faturado");

  const selectedFuelings = items.filter(i => selected.has(i.id)).map(i => ({
    ...i,
    vehicle_plate: vehicles.get(i.veiculo_id) || "",
  }));

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Abastecimentos</h1>
            <p className="text-sm text-muted-foreground">Registre abastecimentos e gere contas a pagar</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={Fuel} label="Registros" value={filtered.length} />
          <SummaryCard icon={Fuel} label="Total Litros" value={`${totalLiters.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L`} />
          <SummaryCard icon={DollarSign} label="Valor Total" value={formatCurrency(totalValue)} valueColor="primary" />
          <SummaryCard icon={Fuel} label="Selecionados" value={selected.size} />
        </div>

        {/* Batch actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">
              {selected.size} abastecimento(s) — {formatCurrency(selectedFuelings.reduce((s, f) => s + Number(f.valor_total), 0))}
            </span>
            <Button size="sm" onClick={() => setGenerateOpen(true)} className="ml-auto">
              <DollarSign className="h-4 w-4 mr-1" /> Gerar Conta(s) a Pagar
            </Button>
          </div>
        )}

        {/* Filters + select all */}
        <div className="flex flex-wrap gap-2 items-center">
          {selectableItems.length > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <Checkbox
                checked={selected.size === selectableItems.length && selectableItems.length > 0}
                onCheckedChange={toggleAll}
              />
              <span className="text-xs text-muted-foreground">Selecionar todos</span>
            </div>
          )}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar placa, posto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="nao_faturado">Não Faturado</SelectItem>
              <SelectItem value="faturado">Faturado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-4">
            <Fuel className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum abastecimento encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(item => {
              const isFaturado = item.status_faturamento === "faturado";
              const isSelected = selected.has(item.id);
              return (
                <Card
                  key={item.id}
                  className={`transition-all ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {!isFaturado && (
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.id)} className="mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{vehicles.get(item.veiculo_id) || "—"}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(item.data_abastecimento + "T12:00:00"), "dd/MM/yyyy")}</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_FAT[item.status_faturamento]?.variant || "outline"} className="text-[10px] shrink-0">
                        {STATUS_FAT[item.status_faturamento]?.label || item.status_faturamento}
                      </Badge>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Combustível</span>
                        <p className="font-medium text-foreground">{FUEL_LABELS[item.tipo_combustivel] || item.tipo_combustivel}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Litros</span>
                        <p className="font-mono font-medium text-foreground">{Number(item.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">R$/L</span>
                        <p className="font-mono font-medium text-foreground">{Number(item.valor_por_litro).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</p>
                      </div>
                    </div>

                    {item.posto_combustivel && (
                      <p className="text-xs text-muted-foreground truncate">Posto: {item.posto_combustivel}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(Number(item.valor_total))}
                      </span>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(item); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!isFaturado && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <FuelingFormDialog open={formOpen} onOpenChange={setFormOpen} empresaId={empresaId} userId={user?.id || ""} fueling={editing} onSaved={fetchData} />
        {generateOpen && (
          <GeneratePayablesDialog open={generateOpen} onOpenChange={setGenerateOpen} selectedFuelings={selectedFuelings} empresaId={empresaId} userId={user?.id || ""} onGenerated={fetchData} />
        )}
      </div>
      {ConfirmDialog}
    </AdminLayout>
  );
}
