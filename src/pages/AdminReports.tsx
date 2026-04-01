import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Search, Download, Users, Car, Package, FolderTree } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useToast } from "@/hooks/use-toast";
import { maskCNPJ, maskPhone } from "@/lib/masks";

type ReportType = "pessoas" | "veiculos" | "cargas" | "plano_contas";

const REPORT_TABS: { value: ReportType; label: string; icon: React.ElementType }[] = [
  { value: "pessoas", label: "Pessoas", icon: Users },
  { value: "veiculos", label: "Veículos", icon: Car },
  { value: "cargas", label: "Natureza de Cargas", icon: Package },
  { value: "plano_contas", label: "Plano de Contas", icon: FolderTree },
];

const PERSON_CATEGORIES = ["__all__", "motorista", "colaborador", "cliente", "proprietario", "fornecedor"];
const PERSON_CAT_LABELS: Record<string, string> = {
  __all__: "Todas", motorista: "Motoristas", colaborador: "Colaboradores",
  cliente: "Clientes", proprietario: "Proprietários", fornecedor: "Fornecedores",
};

const VEHICLE_TYPES: Record<string, string> = {
  __all__: "Todos", truck: "Truck", bitruck: "Bitruck", carreta: "Carreta",
  carreta_ls: "LS", rodotrem: "Rodotrem", bitrem: "Bitrem",
  treminhao: "Treminhão", utilitario: "Utilitário", passeio: "Passeio",
};

const ACCOUNT_TYPES: Record<string, string> = {
  __all__: "Todos", receita: "Receita", despesa: "Despesa",
};

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const bom = "\uFEFF";
  const csv = bom + [headers.join(";"), ...rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── People Report ───
function PeopleReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setData(data || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = data;
    if (category !== "__all__") result = result.filter(p => p.role === category);
    if (statusFilter !== "__all__") {
      const isActive = statusFilter === "ativo";
      result = result.filter(p => (p.status === "approved") === isActive);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        (p.full_name || "").toLowerCase().includes(s) ||
        (p.cpf_cnpj || "").includes(s) ||
        (p.phone || "").includes(s) ||
        (p.city || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [data, category, statusFilter, search]);

  const exportCsv = () => {
    const headers = ["Nome", "Categoria", "CPF/CNPJ", "Telefone", "Cidade", "UF", "Status"];
    const rows = filtered.map(p => [
      p.full_name || "", PERSON_CAT_LABELS[p.role] || p.role || "",
      p.cpf_cnpj || "", p.phone || "", p.city || "", p.state || "",
      p.status === "approved" ? "Ativo" : "Inativo",
    ]);
    downloadCsv("relatorio_pessoas.csv", headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF/CNPJ, telefone, cidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            {PERSON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{PERSON_CAT_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell><Badge variant="secondary">{PERSON_CAT_LABELS[p.role] || p.role}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{p.cpf_cnpj || "—"}</TableCell>
                <TableCell>{p.phone || "—"}</TableCell>
                <TableCell>{[p.city, p.state].filter(Boolean).join("/") || "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "approved" ? "default" : "secondary"}>
                    {p.status === "approved" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Vehicles Report ───
function VehiclesReport() {
  const [data, setData] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("__all__");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [vRes, pRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("brand"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    setData(vRes.data || []);
    setProfiles(pRes.data || []);
    setLoading(false);
  };

  const getName = (userId: string | null) => {
    if (!userId) return "—";
    return profiles.find(p => p.user_id === userId)?.full_name || "—";
  };

  const filtered = useMemo(() => {
    let result = data;
    if (typeFilter !== "__all__") result = result.filter(v => v.vehicle_type === typeFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(v =>
        (v.plate || "").toLowerCase().includes(s) ||
        (v.brand || "").toLowerCase().includes(s) ||
        (v.model || "").toLowerCase().includes(s) ||
        getName(v.driver_id).toLowerCase().includes(s) ||
        getName(v.owner_id).toLowerCase().includes(s)
      );
    }
    return result;
  }, [data, typeFilter, search, profiles]);

  const exportCsv = () => {
    const headers = ["Placa", "Marca", "Modelo", "Ano", "Tipo", "Motorista", "Proprietário"];
    const rows = filtered.map(v => [
      v.plate, v.brand, v.model, String(v.year),
      VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type,
      getName(v.driver_id), getName(v.owner_id),
    ]);
    downloadCsv("relatorio_veiculos.csv", headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por placa, marca, modelo, motorista..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {Object.entries(VEHICLE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Marca/Modelo</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Motorista</TableHead>
              <TableHead>Proprietário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : filtered.map(v => (
              <TableRow key={v.id}>
                <TableCell className="font-mono font-medium">{v.plate}</TableCell>
                <TableCell>{v.brand} {v.model}</TableCell>
                <TableCell>{v.year}</TableCell>
                <TableCell><Badge variant="secondary">{VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type}</Badge></TableCell>
                <TableCell>{getName(v.driver_id)}</TableCell>
                <TableCell>{getName(v.owner_id)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Cargas Report ───
function CargasReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("cargas").select("*").order("produto_predominante");
    setData(data || []);
    setLoading(false);
  };

  const tipos = useMemo(() => {
    const set = new Set(data.map(c => c.tipo).filter(Boolean));
    return ["__all__", ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (tipoFilter !== "__all__") result = result.filter(c => c.tipo === tipoFilter);
    if (statusFilter !== "__all__") {
      const isActive = statusFilter === "ativo";
      result = result.filter(c => c.ativo === isActive);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        (c.produto_predominante || "").toLowerCase().includes(s) ||
        (c.ncm || "").includes(s) ||
        (c.sinonimos || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [data, tipoFilter, statusFilter, search]);

  const exportCsv = () => {
    const headers = ["Produto", "Tipo", "NCM", "Sinônimos", "Tolerância Quebra", "Status"];
    const rows = filtered.map(c => [
      c.produto_predominante, c.tipo || "", c.ncm || "", c.sinonimos || "",
      c.tolerancia_quebra != null ? `${c.tolerancia_quebra}%` : "", c.ativo ? "Ativo" : "Inativo",
    ]);
    downloadCsv("relatorio_cargas.csv", headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por produto, NCM, sinônimos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {tipos.map(t => <SelectItem key={t} value={t}>{t === "__all__" ? "Todos os tipos" : t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>NCM</TableHead>
              <TableHead>Sinônimos</TableHead>
              <TableHead>Toler. Quebra</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.produto_predominante}</TableCell>
                <TableCell><Badge variant="secondary">{c.tipo || "—"}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{c.ncm || "—"}</TableCell>
                <TableCell className="max-w-[200px] truncate">{c.sinonimos || "—"}</TableCell>
                <TableCell>{c.tolerancia_quebra != null ? `${c.tolerancia_quebra}%` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Chart of Accounts Report ───
function PlanoContasReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const { allIds } = useUnifiedCompany();

  useEffect(() => { if (allIds.length > 0) fetchData(); }, [allIds]);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .in("empresa_id", allIds)
      .order("codigo");
    setData(data || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = data;
    if (tipoFilter !== "__all__") result = result.filter(c => c.tipo === tipoFilter);
    if (statusFilter !== "__all__") {
      const isActive = statusFilter === "ativo";
      result = result.filter(c => c.ativo === isActive);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        (c.nome || "").toLowerCase().includes(s) ||
        (c.codigo || "").includes(s)
      );
    }
    return result;
  }, [data, tipoFilter, statusFilter, search]);

  const getParentPath = (item: any): string => {
    if (!item.conta_pai_id) return "";
    const parent = data.find(d => d.id === item.conta_pai_id);
    if (!parent) return "";
    const grandParent = getParentPath(parent);
    return grandParent ? `${grandParent} > ${parent.nome}` : parent.nome;
  };

  const exportCsv = () => {
    const headers = ["Código", "Nome", "Tipo", "Nível", "Tipo Operacional", "Caminho", "Status"];
    const rows = filtered.map(c => [
      c.codigo, c.nome, c.tipo, String(c.nivel),
      c.tipo_operacional || "", getParentPath(c), c.ativo ? "Ativo" : "Inativo",
    ]);
    downloadCsv("relatorio_plano_contas.csv", headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Caminho</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Tipo Oper.</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-medium">{c.codigo}</TableCell>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{getParentPath(c) || "—"}</TableCell>
                <TableCell><Badge variant="secondary">{c.tipo}</Badge></TableCell>
                <TableCell>{c.nivel}</TableCell>
                <TableCell>{c.tipo_operacional || "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function AdminReports() {
  const { hasAdminAccess, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ReportType>("pessoas");

  useEffect(() => {
    if (!roleLoading && !hasAdminAccess) {
      navigate("/");
    }
  }, [roleLoading, hasAdminAccess]);

  if (roleLoading) return null;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Relatórios de Cadastros</h1>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ReportType)}>
          <TabsList className="flex-wrap h-auto gap-1">
            {REPORT_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="pt-6">
            {activeTab === "pessoas" && <PeopleReport />}
            {activeTab === "veiculos" && <VehiclesReport />}
            {activeTab === "cargas" && <CargasReport />}
            {activeTab === "plano_contas" && <PlanoContasReport />}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
