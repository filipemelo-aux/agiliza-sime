import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const { user } = useUserRole();
  const [items, setItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").limit(1).maybeSingle();
    const eid = estab?.id || "";
    setEmpresaId(eid);

    const [{ data: fData }, { data: vData }] = await Promise.all([
      supabase
        .from("fuelings")
        .select("*")
        .is("deleted_at", null)
        .order("data_abastecimento", { ascending: false }),
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
    if (!confirm("Excluir este abastecimento?")) return;
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
            <Plus className="h-4 w-4 mr-1" /> Novo Abastecimento
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-xl font-bold text-foreground">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Litros</p>
              <p className="text-xl font-bold text-foreground">{totalLiters.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold text-primary">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Selecionados</p>
              <p className="text-xl font-bold text-foreground">{selected.size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">
              {selected.size} abastecimento(s) selecionado(s) — R$ {selectedFuelings.reduce((s, f) => s + Number(f.valor_total), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
            <Button size="sm" onClick={() => setGenerateOpen(true)} className="ml-auto">
              <DollarSign className="h-4 w-4 mr-1" /> Gerar Conta(s) a Pagar
            </Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar placa, posto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="nao_faturado">Não Faturado</SelectItem>
                  <SelectItem value="faturado">Faturado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Fuel className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum abastecimento encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.filter(i => i.status_faturamento === "nao_faturado").length > 0 && selected.size === filtered.filter(i => i.status_faturamento === "nao_faturado").length}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Combustível</TableHead>
                      <TableHead className="text-right">Litros</TableHead>
                      <TableHead className="text-right">R$/L</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Posto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(item => {
                      const isFaturado = item.status_faturamento === "faturado";
                      return (
                        <TableRow key={item.id} className={selected.has(item.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(item.id)}
                              onCheckedChange={() => toggleSelect(item.id)}
                              disabled={isFaturado}
                            />
                          </TableCell>
                          <TableCell>{format(new Date(item.data_abastecimento + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="font-medium">{vehicles.get(item.veiculo_id) || "—"}</TableCell>
                          <TableCell>{FUEL_LABELS[item.tipo_combustivel] || item.tipo_combustivel}</TableCell>
                          <TableCell className="text-right font-mono">{Number(item.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</TableCell>
                          <TableCell className="text-right font-mono">{Number(item.valor_por_litro).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</TableCell>
                          <TableCell className="text-right font-mono font-medium">R$ {Number(item.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{item.posto_combustivel || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_FAT[item.status_faturamento]?.variant || "outline"}>
                              {STATUS_FAT[item.status_faturamento]?.label || item.status_faturamento}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setEditing(item); setFormOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {!isFaturado && (
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <FuelingFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          empresaId={empresaId}
          userId={user?.id || ""}
          fueling={editing}
          onSaved={fetchData}
        />

        {generateOpen && (
          <GeneratePayablesDialog
            open={generateOpen}
            onOpenChange={setGenerateOpen}
            selectedFuelings={selectedFuelings}
            empresaId={empresaId}
            userId={user?.id || ""}
            onGenerated={fetchData}
          />
        )}
      </div>
    </AdminLayout>
  );
}
