import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Search, Download, Users, Car, Package, FolderTree, Printer } from "lucide-react";
import { format } from "date-fns";
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

function printPdf(title: string, headers: string[], rows: string[][], companyName: string, companyCnpjs: string) {
  const now = format(new Date(), "dd/MM/yyyy HH:mm");
  const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
  const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";

  const tableRows = rows.map((r, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fb";
    return `<tr style="background:${bg}">${r.map(c => `<td style="font-family:${FONT};font-size:11px;color:#333;padding:7px 10px;border-bottom:1px solid #e8ecf0">${c ?? ""}</td>`).join("")}</tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style type="text/css">
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  @page { margin: 8mm 6mm; size: A4 landscape; }
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:${FONT};-webkit-text-size-adjust:100%">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8">
<tr><td align="center" style="padding:10px 8px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:1100px;font-family:${FONT}">

<!-- HEADER -->
<tr><td style="background:#ffffff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="width:48px;vertical-align:middle;padding-right:16px">
      <img src="${logoUrl}" alt="SIME" width="42" height="42" style="display:block;height:42px;width:42px;border-radius:6px;border:0" />
    </td>
    <td style="vertical-align:middle">
      <div style="font-family:${FONT};font-weight:800;font-size:18px;color:#2B4C7E;line-height:1.2;letter-spacing:0.3px">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
      <div style="font-size:11px;color:#666;line-height:1.4;margin-top:2px">${companyName}</div>
      ${companyCnpjs.split(" / ").map(c => `<div style="font-size:11px;color:#666;line-height:1.4">CNPJ: ${c}</div>`).join("\n      ")}
    </td>
  </tr></table>
</td></tr>

<tr><td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="border-bottom:3px solid #2B4C7E;font-size:0;line-height:0;height:1px">&nbsp;</td></tr>
<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- TITLE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-family:${FONT};font-size:17px;font-weight:700;color:#2B4C7E;margin:0">${title.toUpperCase()}</div>
</td></tr>

<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- SUMMARY BOXES -->
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="48%" style="background:#f0f4f8;border:1px solid #e8ecf0;border-radius:10px;padding:14px 16px;vertical-align:top">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;font-weight:600">Total de Registros</div>
      <div style="font-family:${FONT};font-size:20px;font-weight:700;color:#2B4C7E;margin:0">${rows.length}</div>
    </td>
    <td width="4%" style="font-size:0">&nbsp;</td>
    <td width="48%" style="background:#f0f4f8;border:1px solid #e8ecf0;border-radius:10px;padding:14px 16px;vertical-align:top">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;font-weight:600">Data de Geração</div>
      <div style="font-family:${FONT};font-size:14px;font-weight:700;color:#2B4C7E;margin:0">${now}</div>
    </td>
  </tr></table>
</td></tr>

<tr><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- TABLE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:12px 16px;overflow-x:auto">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;min-width:600px">
    <thead>
      <tr style="background:#2B4C7E">
        ${headers.map(h => `<th style="font-family:${FONT};font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;padding:10px;text-align:left;border-bottom:2px solid #1d3a5f">${h}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</td></tr>

<tr><td style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>

<!-- FOOTER -->
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">SIME TRANSPORTES — ${companyName}</div>
  ${companyCnpjs.split(" / ").map(c => `<div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">CNPJ: ${c}</div>`).join("\n  ")}
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">Documento gerado em ${now}</div>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    window.location.href = url;
  }
}

function ExportButtons({ onCsv, onPdf, disabled }: { onCsv: () => void; onPdf: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={onCsv} disabled={disabled} size="sm">
        <Download className="h-4 w-4 mr-2" /> CSV
      </Button>
      <Button variant="outline" onClick={onPdf} disabled={disabled} size="sm">
        <Printer className="h-4 w-4 mr-2" /> PDF
      </Button>
    </div>
  );
}

// ─── People Report ───
function PeopleReport({ companyName, companyCnpjs }: { companyName: string; companyCnpjs: string }) {
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

  const getHeaders = () => ["Nome", "Categoria", "CPF/CNPJ", "Telefone", "Cidade", "UF", "Status"];
  const getRows = () => filtered.map(p => [
    p.full_name || "", PERSON_CAT_LABELS[p.role] || p.role || "",
    p.cpf_cnpj || "", p.phone || "", p.city || "", p.state || "",
    p.status === "approved" ? "Ativo" : "Inativo",
  ]);

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
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_pessoas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Pessoas", getHeaders(), getRows(), companyName, companyCnpjs)}
          disabled={filtered.length === 0}
        />
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
function VehiclesReport({ companyName, companyCnpjs }: { companyName: string; companyCnpjs: string }) {
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
        (v.renavam || "").toLowerCase().includes(s) ||
        (v.brand || "").toLowerCase().includes(s) ||
        (v.model || "").toLowerCase().includes(s) ||
        getName(v.driver_id).toLowerCase().includes(s) ||
        getName(v.owner_id).toLowerCase().includes(s)
      );
    }
    return result;
  }, [data, typeFilter, search, profiles]);

  const getHeaders = () => ["Placa", "RENAVAM", "Marca", "Modelo", "Ano", "Tipo", "Motorista", "Proprietário"];
  const getRows = () => filtered.map(v => [
    v.plate, v.renavam || "", v.brand, v.model, String(v.year),
    VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type,
    getName(v.driver_id), getName(v.owner_id),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por placa, RENAVAM, marca, modelo, motorista..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {Object.entries(VEHICLE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_veiculos.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Veículos", getHeaders(), getRows(), companyName, companyCnpjs)}
          disabled={filtered.length === 0}
        />
      </div>
      <div className="text-sm text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>RENAVAM</TableHead>
              <TableHead>Marca/Modelo</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Motorista</TableHead>
              <TableHead>Proprietário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : filtered.map(v => (
              <TableRow key={v.id}>
                <TableCell className="font-mono font-medium">{v.plate}</TableCell>
                <TableCell className="font-mono text-xs">{v.renavam || "—"}</TableCell>
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

  const getHeaders = () => ["Produto", "Tipo", "NCM", "Sinônimos", "Tolerância Quebra", "Status"];
  const getRows = () => filtered.map(c => [
    c.produto_predominante, c.tipo || "", c.ncm || "", c.sinonimos || "",
    c.tolerancia_quebra != null ? `${c.tolerancia_quebra}%` : "", c.ativo ? "Ativo" : "Inativo",
  ]);

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
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_cargas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Natureza de Cargas", getHeaders(), getRows())}
          disabled={filtered.length === 0}
        />
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

  const getHeaders = () => ["Código", "Nome", "Tipo", "Nível", "Tipo Operacional", "Caminho", "Status"];
  const getRows = () => filtered.map(c => [
    c.codigo, c.nome, c.tipo, String(c.nivel),
    c.tipo_operacional || "", getParentPath(c), c.ativo ? "Ativo" : "Inativo",
  ]);

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
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_plano_contas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório do Plano de Contas", getHeaders(), getRows())}
          disabled={filtered.length === 0}
        />
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
