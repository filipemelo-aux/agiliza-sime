import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderTree } from "lucide-react";
import { toast } from "sonner";

const TIPO_OPERACIONAL_OPTIONS = [
  { value: "", label: "Nenhum (genérica)" },
  { value: "manutencao", label: "Manutenção" },
  { value: "combustivel", label: "Combustível" },
];

interface Category {
  id: string;
  name: string;
  type: "receivable" | "payable";
  active: boolean;
  tipo_operacional: string | null;
  plano_contas_id: string | null;
}

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
}

export function FinancialCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"receivable" | "payable">("receivable");
  const [tipoOperacional, setTipoOperacional] = useState("");
  const [planoContasId, setPlanoContasId] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    const [catRes, chartRes] = await Promise.all([
      supabase.from("financial_categories").select("*").order("type").order("name"),
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo").eq("ativo", true).order("codigo"),
    ]);
    if (catRes.error) toast.error(catRes.error.message);
    else setCategories((catRes.data as any) || []);
    if (chartRes.error) toast.error(chartRes.error.message);
    else setChartAccounts((chartRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Map category type to chart account type
  const chartTypeForCategory = (catType: "receivable" | "payable") =>
    catType === "receivable" ? "receita" : "despesa";

  // Filtered chart accounts by matching type
  const filteredChartAccounts = useMemo(() => {
    const targetTipo = chartTypeForCategory(type);
    return chartAccounts.filter((a) => a.tipo === targetTipo);
  }, [chartAccounts, type]);

  // Map for display
  const chartMap = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chartAccounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [chartAccounts]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setTipoOperacional("");
    setPlanoContasId("");
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Informe o nome da categoria");
    if (!planoContasId) return toast.error("Selecione a conta do plano de contas");

    // Validate type match
    const selectedChart = chartMap.get(planoContasId);
    if (selectedChart && selectedChart.tipo !== chartTypeForCategory(type)) {
      return toast.error("O tipo da categoria deve corresponder ao tipo da conta contábil");
    }

    const payload: any = {
      name: name.trim(),
      type,
      tipo_operacional: (tipoOperacional && tipoOperacional !== "none") ? tipoOperacional : null,
      plano_contas_id: planoContasId,
    };

    if (editingId) {
      const { error } = await supabase.from("financial_categories").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Categoria atualizada");
    } else {
      const { error } = await supabase.from("financial_categories").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Categoria criada");
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setTipoOperacional(cat.tipo_operacional || "");
    setPlanoContasId(cat.plano_contas_id || "");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta categoria?")) return;
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    fetchData();
  };

  const filtered = filterType === "all" ? categories : categories.filter(c => c.type === filterType);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Categorias Financeiras</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="receivable">A Receber</SelectItem>
              <SelectItem value="payable">A Pagar</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Categoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Frete, Manutenção..." />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={(v) => {
                    setType(v as any);
                    setPlanoContasId(""); // Reset when type changes
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable">A Receber</SelectItem>
                      <SelectItem value="payable">A Pagar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <FolderTree className="h-3.5 w-3.5 text-primary" />
                    Conta Contábil (Plano de Contas) *
                  </Label>
                  {filteredChartAccounts.length === 0 ? (
                    <p className="text-xs text-destructive mt-1">
                      Nenhuma conta do tipo "{chartTypeForCategory(type)}" cadastrada no Plano de Contas.
                      Cadastre primeiro em Cadastros → Plano de Contas.
                    </p>
                  ) : (
                    <Select value={planoContasId} onValueChange={setPlanoContasId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a conta contábil" /></SelectTrigger>
                      <SelectContent>
                        {filteredChartAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="font-mono text-xs mr-2">{a.codigo}</span> {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Vincula esta categoria à estrutura contábil para DRE e relatórios financeiros.
                  </p>
                </div>
                {type === "payable" && (
                  <div>
                    <Label>Comportamento Operacional</Label>
                    <Select value={tipoOperacional} onValueChange={setTipoOperacional}>
                      <SelectTrigger><SelectValue placeholder="Nenhum (genérica)" /></SelectTrigger>
                      <SelectContent>
                        {TIPO_OPERACIONAL_OPTIONS.map(o => (
                          <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Define se essa categoria ativa campos especiais no formulário de despesas (ex: dados de manutenção ou combustível).
                    </p>
                  </div>
                )}
                <Button onClick={handleSave} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Nenhuma categoria cadastrada</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Conta Contábil</TableHead>
                <TableHead>Comportamento</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cat) => {
                const chart = cat.plano_contas_id ? chartMap.get(cat.plano_contas_id) : null;
                return (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <Badge variant={cat.type === "receivable" ? "default" : "secondary"}>
                        {cat.type === "receivable" ? "A Receber" : "A Pagar"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {chart ? (
                        <span className="text-xs">
                          <span className="font-mono text-muted-foreground">{chart.codigo}</span>{" "}
                          {chart.nome}
                        </span>
                      ) : (
                        <span className="text-xs text-destructive">Não vinculada</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {cat.tipo_operacional ? (
                        <Badge variant="outline" className="text-[10px]">
                          {cat.tipo_operacional === "manutencao" ? "🔧 Manutenção" : "⛽ Combustível"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cat.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
