import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
}

export function FinancialCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"receivable" | "payable">("receivable");
  const [tipoOperacional, setTipoOperacional] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_categories")
      .select("*")
      .order("type")
      .order("name");
    if (error) toast.error(error.message);
    else setCategories((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Informe o nome da categoria");
    
    const payload: any = { name: name.trim(), type, tipo_operacional: (tipoOperacional && tipoOperacional !== "none") ? tipoOperacional : null };

    if (editingId) {
      const { error } = await supabase
        .from("financial_categories")
        .update(payload)
        .eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Categoria atualizada");
    } else {
      const { error } = await supabase
        .from("financial_categories")
        .insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Categoria criada");
    }
    setDialogOpen(false);
    setEditingId(null);
    setName("");
    setTipoOperacional("");
    fetchCategories();
  };

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setTipoOperacional(cat.tipo_operacional || "");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta categoria?")) return;
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    fetchCategories();
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
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setName(""); setTipoOperacional(""); } }}>
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
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable">A Receber</SelectItem>
                      <SelectItem value="payable">A Pagar</SelectItem>
                    </SelectContent>
                  </Select>
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
                <TableHead>Comportamento</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <Badge variant={cat.type === "receivable" ? "default" : "secondary"}>
                      {cat.type === "receivable" ? "A Receber" : "A Pagar"}
                    </Badge>
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
