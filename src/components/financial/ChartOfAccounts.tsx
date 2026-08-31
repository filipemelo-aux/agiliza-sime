import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { GlobalToolbar, ToolbarIconButton } from "@/components/ui/global-toolbar";
import { Plus, Pencil, ChevronRight, ChevronDown, Search, FolderTree, List, ListTree } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TIPO_OPERACIONAL_OPTIONS = [
  { value: "", label: "Nenhum (conta genérica)" },
  { value: "manutencao", label: "🔧 Manutenção" },
  { value: "combustivel", label: "⛽ Combustível" },
];

const CENTRO_CUSTO_DEFAULT_OPTIONS = [
  { value: "", label: "Nenhum (usuário escolhe)" },
  { value: "frota_propria", label: "Frota Própria" },
  { value: "frota_terceiros", label: "Frota Terceiros" },
  { value: "administrativo", label: "Administrativo" },
  { value: "operacional", label: "Operacional" },
];

const CENTRO_CUSTO_LABELS: Record<string, string> = {
  frota_propria: "Frota Própria",
  frota_terceiros: "Frota Terceiros",
  administrativo: "Administrativo",
  operacional: "Operacional",
};

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
  centro_custo_default: string | null;
}

interface TreeNode extends Account {
  children: TreeNode[];
}

interface FlatRow extends Account {
  depth: number;
  hasChildren: boolean;
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
    nodes.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: "base" }));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [establishments, setEstablishments] = useState<{ id: string; razao_social: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "despesa" | "receita">("todos");

  // Form state
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [contaPaiId, setContaPaiId] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [tipoOperacional, setTipoOperacional] = useState("");
  const [centroCustoDefault, setCentroCustoDefault] = useState("");
  const [empresaId, setEmpresaId] = useState("");

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
      const matriz = estRes.data?.find((e: any) => e.type === "matriz") || estRes.data?.[0];
      if (matriz && !empresaId) setEmpresaId(matriz.id);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const searching = searchText.trim().length > 0;

  const filtered = useMemo(() => {
    let list = accounts;
    if (tipoFilter !== "todos") list = list.filter((a) => a.tipo === tipoFilter);
    if (searching) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((a) => a.nome.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q));
    }
    return list;
  }, [accounts, tipoFilter, searchText, searching]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Linhas achatadas: com busca mostra lista plana; sem busca respeita árvore/expansão
  const flatRows = useMemo<FlatRow[]>(() => {
    if (searching) {
      return filtered.map((a) => ({ ...a, depth: 0, hasChildren: false }));
    }
    const rows: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      nodes.forEach((n) => {
        rows.push({ ...n, depth, hasChildren: n.children.length > 0 });
        if (expanded.has(n.id)) walk(n.children, depth + 1);
      });
    };
    walk(tree, 0);
    return rows;
  }, [tree, expanded, searching, filtered]);

  // limpa seleção de linhas que saíram do filtro
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(flatRows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [flatRows]);

  // Plano de contas é único e compartilhado entre as empresas
  const parentOptions = useMemo(
    () => accounts.filter((a) => a.id !== editingId),
    [accounts, editingId]
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(accounts.map((a) => a.id)));
  const collapseAll = () => setExpanded(new Set());

  const resetForm = () => {
    setEditingId(null);
    setCodigo("");
    setNome("");
    setTipo("despesa");
    setContaPaiId(null);
    setAtivo(true);
    setTipoOperacional("");
    setCentroCustoDefault("");
    // mantém a empresa padrão (matriz): plano de contas é compartilhado
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (acc: Account) => {
    setEditingId(acc.id);
    setCodigo(acc.codigo);
    setNome(acc.nome);
    setTipo(acc.tipo as any);
    setContaPaiId(acc.conta_pai_id);
    setAtivo(acc.ativo);
    setTipoOperacional(acc.tipo_operacional || "");
    setCentroCustoDefault(acc.centro_custo_default || "");
    setEmpresaId(acc.empresa_id);
    setDialogOpen(true);
  };

  const editSelected = () => {
    const id = [...selected][0];
    const acc = accounts.find((a) => a.id === id);
    if (acc) handleEdit(acc);
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
      centro_custo_default: centroCustoDefault || null,
    };

    let savedId = editingId;
    if (editingId) {
      const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Conta atualizada");
    } else {
      const { data: inserted, error } = await supabase.from("chart_of_accounts").insert(payload).select("id").single();
      if (error) {
        if (error.message.includes("unique")) return toast.error("Código já existe para esta empresa");
        return toast.error(error.message);
      }
      savedId = inserted?.id || null;
      toast.success("Conta criada");
    }

    // Cascade centro_custo_default to all descendants
    if (savedId && payload.centro_custo_default) {
      const collectDescendants = (parentId: string): string[] => {
        const direct = accounts.filter(a => a.conta_pai_id === parentId);
        return direct.flatMap(c => [c.id, ...collectDescendants(c.id)]);
      };
      const descendantIds = collectDescendants(savedId);
      if (descendantIds.length > 0) {
        const { error: cascadeErr } = await supabase
          .from("chart_of_accounts")
          .update({ centro_custo_default: payload.centro_custo_default })
          .in("id", descendantIds);
        if (cascadeErr) toast.error("Erro ao propagar centro de custo: " + cascadeErr.message);
        else toast.success(`Centro de custo propagado para ${descendantIds.length} conta(s) filha(s)`);
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const columns: DataGridColumn<FlatRow>[] = [
    {
      key: "conta",
      header: "Conta",
      sortValue: (r) => r.codigo,
      cell: (r) => (
        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${r.depth * 20}px` }}>
          {!searching && r.hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
              className="p-0.5 hover:bg-muted rounded shrink-0"
              aria-label={expanded.has(r.id) ? "Recolher" : "Expandir"}
            >
              {expanded.has(r.id) ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <span className="font-mono text-[11px] text-muted-foreground shrink-0">{r.codigo}</span>
          <span className="font-medium truncate">{r.nome}</span>
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      width: "90px",
      sortValue: (r) => r.tipo,
      cell: (r) => (
        <Badge variant={r.tipo === "despesa" ? "secondary" : "default"} className="text-[10px]">
          {r.tipo === "despesa" ? "Despesa" : "Receita"}
        </Badge>
      ),
    },
    {
      key: "operacional",
      header: "Operacional",
      width: "120px",
      cell: (r) =>
        r.tipo_operacional ? (
          <Badge variant="outline" className="text-[10px]">
            {r.tipo_operacional === "manutencao" ? "🔧 Manutenção" : "⛽ Combustível"}
          </Badge>
        ) : null,
    },
    {
      key: "centro_custo",
      header: "Centro de Custo",
      width: "130px",
      sortValue: (r) => r.centro_custo_default,
      cell: (r) =>
        r.centro_custo_default ? (
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            {CENTRO_CUSTO_LABELS[r.centro_custo_default] || r.centro_custo_default}
          </Badge>
        ) : null,
    },
    {
      key: "status",
      header: "Status",
      width: "80px",
      sortValue: (r) => (r.ativo ? 1 : 0),
      cell: (r) =>
        r.ativo ? (
          <Badge variant="outline" className="text-[10px] text-success border-success/40">Ativa</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativa</Badge>
        ),
    },
  ];

  const totalizadores = useMemo(() => {
    const desp = filtered.filter((a) => a.tipo === "despesa").length;
    const rec = filtered.filter((a) => a.tipo === "receita").length;
    return { desp, rec, total: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-3">
      <GlobalToolbar
        iconOnlyOnDesktop
        selectedCount={selected.size}
        filtersFirstOnMobile
        actions={[
          { key: "nova", label: "Nova Conta", icon: Plus, mode: "create", variant: "default", onClick: openNew },
          { key: "editar", label: "Editar", icon: Pencil, mode: "single", onClick: editSelected },
          { key: "expandir", label: "Expandir tudo", icon: ListTree, mode: "always", variant: "outline", hidden: searching, onClick: expandAll },
          { key: "recolher", label: "Recolher tudo", icon: List, mode: "always", variant: "outline", hidden: searching, onClick: collapseAll },
        ]}
      >
        <div className="relative order-3 w-full lg:order-none lg:ml-1 lg:w-[240px] lg:border-l lg:border-border lg:pl-2 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou nome..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9 md:h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(([
            { tab: "todos", label: `Todos (${totalizadores.total})`, icon: FolderTree },
            { tab: "despesa", label: `Desp. (${totalizadores.desp})`, icon: List },
            { tab: "receita", label: `Rec. (${totalizadores.rec})`, icon: List },
          ] as const)).map(({ tab, label, icon: Icon }) => (
            <ToolbarIconButton
              key={tab}
              label={label}
              icon={Icon}
              active={tipoFilter === tab}
              showLabel
              onClick={() => setTipoFilter(tab)}
            />
          ))}
        </div>
      </GlobalToolbar>

      <DataGrid
        rows={flatRows}
        columns={columns}
        rowId={(r) => r.id}
        selected={selected}
        onSelectedChange={setSelected}
        loading={loading}
        emptyMessage={searching ? "Nenhuma conta encontrada para a busca" : "Nenhuma conta cadastrada"}
        minWidth={760}
        maxHeight="calc(100vh - 260px)"
        rowClassName={(r) => cn(!r.ativo && "opacity-50")}
        footer={
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>{flatRows.length} conta(s) exibida(s){selected.size > 0 ? ` · ${selected.size} selecionada(s)` : ""}</span>
            <span>Despesas: {totalizadores.desp} · Receitas: {totalizadores.rec}</span>
          </div>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Nova"} Conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Código</Label>
                <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="1.1.01" />
              </div>
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Combustível" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            {tipo === "despesa" && (
              <div>
                <Label>Centro de Custo Padrão</Label>
                <Select value={centroCustoDefault || "none"} onValueChange={v => setCentroCustoDefault(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    {CENTRO_CUSTO_DEFAULT_OPTIONS.map(o => (
                      <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Quando definido, o sistema preenche automaticamente o centro de custo nos lançamentos (ex: fatura de cartão).
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
  );
}
