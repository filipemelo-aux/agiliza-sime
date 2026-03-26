import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, ChevronRight, ChevronDown, FolderTree } from "lucide-react";
import { toast } from "sonner";

const TIPO_OPERACIONAL_OPTIONS = [
  { value: "", label: "Nenhum (conta genérica)" },
  { value: "manutencao", label: "🔧 Manutenção" },
  { value: "combustivel", label: "⛽ Combustível" },
];

interface Account {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  conta_pai_id: string | null;
  nivel: number;
  ativo: boolean;
  empresa_id: string;
  tipo_operacional: string | null;
}

interface TreeNode extends Account {
  children: TreeNode[];
  expanded?: boolean;
}

function buildTree(accounts: Account[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  accounts.forEach((a) => map.set(a.id, { ...a, children: [] }));

  accounts.forEach((a) => {
    const node = map.get(a.id)!;
    if (a.conta_pai_id && map.has(a.conta_pai_id)) {
      map.get(a.conta_pai_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.codigo.localeCompare(b.codigo));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function AccountRow({
  node,
  depth,
  expanded,
  onToggle,
  onEdit,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (a: Account) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors ${!node.ativo ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {hasChildren ? (
          <button onClick={() => onToggle(node.id)} className="p-0.5 hover:bg-muted rounded">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{node.codigo}</span>
        <span className="flex-1 text-sm font-medium">{node.nome}</span>
        <Badge variant={node.tipo === "despesa" ? "secondary" : "default"} className="text-[10px]">
          {node.tipo === "despesa" ? "Despesa" : "Receita"}
        </Badge>
        {node.tipo_operacional && (
          <Badge variant="outline" className="text-[10px]">
            {node.tipo_operacional === "manutencao" ? "🔧 Manutenção" : "⛽ Combustível"}
          </Badge>
        )}
        {!node.ativo && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativo</Badge>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isExpanded &&
        node.children.map((child) => (
          <AccountRow key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onEdit={onEdit} />
        ))}
    </>
  );
}

export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [establishments, setEstablishments] = useState<{ id: string; razao_social: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Form state
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [contaPaiId, setContaPaiId] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [tipoOperacional, setTipoOperacional] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    const [accRes, estRes] = await Promise.all([
      supabase.from("chart_of_accounts").select("*").order("codigo"),
      supabase.from("fiscal_establishments").select("id, razao_social").eq("active", true).order("razao_social"),
    ]);
    if (accRes.error) toast.error(accRes.error.message);
    else setAccounts((accRes.data as any) || []);
    if (estRes.error) toast.error(estRes.error.message);
    else {
      setEstablishments(estRes.data || []);
      if (estRes.data?.length === 1 && !empresaId) {
        setEmpresaId(estRes.data[0].id);
        setFilterEmpresa(estRes.data[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (filterEmpresa === "all") return accounts;
    return accounts.filter((a) => a.empresa_id === filterEmpresa);
  }, [accounts, filterEmpresa]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const parentOptions = useMemo(() => {
    const target = empresaId || filterEmpresa;
    if (!target || target === "all") return accounts;
    return accounts.filter((a) => a.empresa_id === target && a.id !== editingId);
  }, [accounts, empresaId, filterEmpresa, editingId]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(filtered.map((a) => a.id)));
  };

  const resetForm = () => {
    setEditingId(null);
    setCodigo("");
    setNome("");
    setTipo("despesa");
    setContaPaiId(null);
    setAtivo(true);
    setTipoOperacional("");
    if (establishments.length === 1) setEmpresaId(establishments[0].id);
    else if (filterEmpresa !== "all") setEmpresaId(filterEmpresa);
    else setEmpresaId("");
  };

  const handleEdit = (acc: Account) => {
    setEditingId(acc.id);
    setCodigo(acc.codigo);
    setNome(acc.nome);
    setTipo(acc.tipo as any);
    setContaPaiId(acc.conta_pai_id);
    setAtivo(acc.ativo);
    setTipoOperacional(acc.tipo_operacional || "");
    setEmpresaId(acc.empresa_id);
    setDialogOpen(true);
  };

  const computeNivel = (parentId: string | null): number => {
    if (!parentId) return 1;
    const parent = accounts.find((a) => a.id === parentId);
    return parent ? parent.nivel + 1 : 1;
  };

  const handleSave = async () => {
    if (!codigo.trim()) return toast.error("Informe o código da conta");
    if (!nome.trim()) return toast.error("Informe o nome da conta");
    if (!empresaId) return toast.error("Selecione a empresa");

    const nivel = computeNivel(contaPaiId);
    const payload = {
      codigo: codigo.trim(),
      nome: nome.trim(),
      tipo,
      conta_pai_id: contaPaiId || null,
      nivel,
      ativo,
      empresa_id: empresaId,
      tipo_operacional: (tipoOperacional && tipoOperacional !== "none") ? tipoOperacional : null,
    };

    if (editingId) {
      const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Conta atualizada");
    } else {
      const { error } = await supabase.from("chart_of_accounts").insert(payload);
      if (error) {
        if (error.message.includes("unique")) return toast.error("Código já existe para esta empresa");
        return toast.error(error.message);
      }
      toast.success("Conta criada");
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-primary" />
          Plano de Contas
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* Empresa unificada - filtro removido */}
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir tudo</Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Conta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Empresa auto-selecionada */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Código</Label>
                    <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="1.1.01" />
                  </div>
                  <div className="col-span-2">
                    <Label>Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Combustível" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="despesa">Despesa</SelectItem>
                        <SelectItem value="receita">Receita</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conta Pai</Label>
                    <Select value={contaPaiId || "none"} onValueChange={(v) => setContaPaiId(v === "none" ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma (raiz)</SelectItem>
                        {parentOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="font-mono text-xs mr-2">{a.codigo}</span> {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {tipo === "despesa" && (
                  <div>
                    <Label>Comportamento Operacional</Label>
                    <Select value={tipoOperacional || "none"} onValueChange={v => setTipoOperacional(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        {TIPO_OPERACIONAL_OPTIONS.map(o => (
                          <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Define se essa conta ativa campos especiais (ex: dados de manutenção ou combustível).
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                  <Label>Conta ativa</Label>
                </div>
                <Button onClick={handleSave} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : tree.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma conta cadastrada</p>
            <p className="text-xs mt-1">Crie a estrutura do seu plano de contas para padronizar o financeiro.</p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {tree.map((node) => (
              <AccountRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggleExpand} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
