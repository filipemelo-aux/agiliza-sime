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
import { SortableTh } from "@/components/ui/sortable-th";
import { useSortableTable } from "@/hooks/useSortableTable";
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

function printPdf(title: string, headers: string[], rows: string[][], matriz: any, cnpjsFooter: string) {
  const now = format(new Date(), "dd/MM/yyyy HH:mm");
  const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
  const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";

  const tableRows = rows.map((r, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fb";
    return `<tr style="background:${bg}">${r.map(c => `<td style="font-family:${FONT};font-size:11px;color:#333;padding:7px 10px;border-bottom:1px solid #e8ecf0">${c ?? ""}</td>`).join("")}</tr>`;
  }).join("");

  const esc = (s: any) => String(s ?? "");
  const matrizName = matriz?.razao_social || "Sime Transporte Ltda";
  const matrizCnpj = matriz?.cnpj
    ? `${matriz.cnpj.slice(0,2)}.${matriz.cnpj.slice(2,5)}.${matriz.cnpj.slice(5,8)}/${matriz.cnpj.slice(8,12)}-${matriz.cnpj.slice(12)}`
    : "";
  const addrParts = [
    matriz?.endereco_logradouro,
    matriz?.endereco_numero,
    matriz?.endereco_bairro,
  ].filter(Boolean).join(", ");
  const cityParts = [matriz?.endereco_municipio, matriz?.endereco_uf].filter(Boolean).join("/");
  const cep = matriz?.endereco_cep ? `CEP ${matriz.endereco_cep}` : "";
  const addrLine = [addrParts, cityParts, cep].filter(Boolean).join(" — ");
  const ieLine = matriz?.inscricao_estadual ? `IE: ${matriz.inscricao_estadual}` : "";
  const cnpjLine = matrizCnpj ? `CNPJ: ${matrizCnpj}` : "";
  const docLine = [cnpjLine, ieLine].filter(Boolean).join("  •  ");

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
      <div style="font-size:11px;color:#444;line-height:1.4;margin-top:2px;font-weight:600">${esc(matrizName)}</div>
      ${addrLine ? `<div style="font-size:10.5px;color:#666;line-height:1.4">${esc(addrLine)}</div>` : ""}
      ${docLine ? `<div style="font-size:10.5px;color:#666;line-height:1.4">${esc(docLine)}</div>` : ""}
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
  <div style="font-size:10px;color:rgba(255,255,255,0.9);margin:2px 0;font-weight:600">SIME TRANSPORTES — ${esc(matrizName)}</div>
  ${cnpjsFooter ? `<div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">CNPJ: ${esc(cnpjsFooter)}</div>` : ""}
  <div style="font-size:10px;color:rgba(255,255,255,0.75);margin:2px 0">Documento gerado em ${now}</div>
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
    <div className="flex gap-1">
      <Button variant="outline" onClick={onCsv} disabled={disabled} size="sm" className="h-7 text-[11px] px-2">
        <Download className="h-3 w-3 mr-1" /> CSV
      </Button>
      <Button variant="outline" onClick={onPdf} disabled={disabled} size="sm" className="h-7 text-[11px] px-2">
        <Printer className="h-3 w-3 mr-1" /> PDF
      </Button>
    </div>
  );
}

// ─── People Report ───
function PeopleReport({ matriz, cnpjsFooter }: { matriz: any; cnpjsFooter: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setData(data || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = data;
    if (category !== "__all__") result = result.filter(p => p.category === category);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        (p.full_name || "").toLowerCase().includes(s) ||
        (p.cnpj || "").includes(s) ||
        (p.phone || "").includes(s) ||
        (p.address_city || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [data, category, search]);

  const { sort, toggle, sorted } = useSortableTable<any, "full_name" | "category" | "cnpj" | "phone" | "city">(
    filtered,
    { key: "full_name", direction: "asc" },
    {
      full_name: r => (r.full_name || "").toLowerCase(),
      category: r => PERSON_CAT_LABELS[r.category] || r.category || "",
      cnpj: r => r.cnpj || "",
      phone: r => r.phone || "",
      city: r => `${r.address_city || ""}/${r.address_state || ""}`,
    },
  );

  const getHeaders = () => ["Nome", "Categoria", "CNPJ", "Telefone", "Cidade", "UF"];
  const getRows = () => filtered.map(p => [
    p.full_name || "", PERSON_CAT_LABELS[p.category] || p.category || "",
    p.cnpj || "", p.phone || "", p.address_city || "", p.address_state || "",
  ]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input placeholder="Buscar nome, CPF/CNPJ, telefone, cidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-[11px]" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            {PERSON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{PERSON_CAT_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_pessoas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Pessoas", getHeaders(), getRows(), matriz, cnpjsFooter)}
          disabled={filtered.length === 0}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-7">
              <SortableTh active={sort.key==="full_name"} direction={sort.direction} onSort={()=>toggle("full_name")} className="py-1 px-2 text-[10px]">Nome</SortableTh>
              <SortableTh active={sort.key==="category"} direction={sort.direction} onSort={()=>toggle("category")} className="py-1 px-2 text-[10px]">Categoria</SortableTh>
              <SortableTh active={sort.key==="cnpj"} direction={sort.direction} onSort={()=>toggle("cnpj")} className="py-1 px-2 text-[10px]">CNPJ</SortableTh>
              <SortableTh active={sort.key==="phone"} direction={sort.direction} onSort={()=>toggle("phone")} className="py-1 px-2 text-[10px]">Telefone</SortableTh>
              <SortableTh active={sort.key==="city"} direction={sort.direction} onSort={()=>toggle("city")} className="py-1 px-2 text-[10px]">Cidade/UF</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-3 text-[11px] text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-3 text-[11px] text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : sorted.map(p => (
              <TableRow key={p.id} className="h-7">
                <TableCell className="py-1 px-2 text-[11px] font-medium">{p.full_name}</TableCell>
                <TableCell className="py-1 px-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">{PERSON_CAT_LABELS[p.category] || p.category}</Badge></TableCell>
                <TableCell className="py-1 px-2 font-mono text-[11px]">{p.cnpj || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{p.phone || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{[p.address_city, p.address_state].filter(Boolean).join("/") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Vehicles Report ───
function VehiclesReport({ matriz, cnpjsFooter }: { matriz: any; cnpjsFooter: string }) {
  const [data, setData] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [fleetFilter, setFleetFilter] = useState("__all__");

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

  const getTrailerPlates = (v: any) =>
    [v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3].filter(Boolean).join(" ");
  const getAllPlates = (v: any) =>
    [v.plate, v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3].filter(Boolean).join(" ");

  const getName = (userId: string | null) => {
    if (!userId) return "—";
    return profiles.find(p => p.user_id === userId)?.full_name || "—";
  };

  const fleetLabel = (f: string) => f === "propria" ? "Própria" : f === "terceiros" ? "Terceiros" : (f || "—");

  const filtered = useMemo(() => {
    let result = data;
    if (typeFilter !== "__all__") {
      const truckTypes = ["truck","bitruck","carreta","carreta_ls","rodotrem","bitrem","treminhao"];
      result = result.filter(v => {
        if (typeFilter === "caminhao") return truckTypes.includes(v.vehicle_type);
        return v.vehicle_type === typeFilter;
      });
    }
    if (fleetFilter !== "__all__") result = result.filter(v => v.fleet_type === fleetFilter);
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
  }, [data, typeFilter, fleetFilter, search, profiles]);

  const { sort, toggle, sorted } = useSortableTable<any, "plate" | "renavam" | "brand" | "year" | "type" | "fleet" | "driver" | "owner">(
    filtered,
    { key: "plate", direction: "asc" },
    {
      plate: r => (r.plate || "").toLowerCase(),
      renavam: r => r.renavam || "",
      brand: r => `${r.brand || ""} ${r.model || ""}`.toLowerCase(),
      year: r => Number(r.year) || 0,
      type: r => VEHICLE_TYPES[r.vehicle_type] || r.vehicle_type || "",
      fleet: r => fleetLabel(r.fleet_type),
      driver: r => getName(r.driver_id).toLowerCase(),
      owner: r => getName(r.owner_id).toLowerCase(),
    },
  );

  const getHeaders = () => ["Placa", "RENAVAM", "Marca", "Modelo", "Ano", "Tipo", "Conjunto", "Frota", "Motorista", "Proprietário"];
  const getRows = () => filtered.map(v => {
    return [
      v.plate || "",
      v.renavam || "", v.brand, v.model, String(v.year),
      VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type,
      getTrailerPlates(v)
        ? `<span style="font-family:'Courier New',monospace;letter-spacing:1px;white-space:pre">${[v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3].filter(Boolean).map((p: string) => p.padEnd(7)).join("  ")}</span>`
        : "—",
      fleetLabel(v.fleet_type),
      getName(v.driver_id), getName(v.owner_id),
    ];
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input placeholder="Buscar placa, RENAVAM, marca, modelo, motorista..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-[11px]" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os tipos</SelectItem>
            <SelectItem value="caminhao">Caminhão</SelectItem>
            <SelectItem value="passeio">Passeio</SelectItem>
            <SelectItem value="utilitario">Utilitário</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fleetFilter} onValueChange={setFleetFilter}>
          <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue placeholder="Frota" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as frotas</SelectItem>
            <SelectItem value="propria">Própria</SelectItem>
            <SelectItem value="terceiros">Terceiros</SelectItem>
          </SelectContent>
        </Select>
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_veiculos.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Veículos", getHeaders(), getRows(), matriz, cnpjsFooter)}
          disabled={filtered.length === 0}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-7">
              <SortableTh active={sort.key==="plate"} direction={sort.direction} onSort={()=>toggle("plate")} className="py-1 px-2 text-[10px]">Placa</SortableTh>
              
              <SortableTh active={sort.key==="renavam"} direction={sort.direction} onSort={()=>toggle("renavam")} className="py-1 px-2 text-[10px]">RENAVAM</SortableTh>
              <SortableTh active={sort.key==="brand"} direction={sort.direction} onSort={()=>toggle("brand")} className="py-1 px-2 text-[10px]">Marca/Modelo</SortableTh>
              <SortableTh active={sort.key==="year"} direction={sort.direction} onSort={()=>toggle("year")} className="py-1 px-2 text-[10px]">Ano</SortableTh>
              <SortableTh active={sort.key==="type"} direction={sort.direction} onSort={()=>toggle("type")} className="py-1 px-2 text-[10px]">Tipo</SortableTh>
              <TableHead className="py-1 px-2 text-[10px]">Conjunto</TableHead>
              <SortableTh active={sort.key==="fleet"} direction={sort.direction} onSort={()=>toggle("fleet")} className="py-1 px-2 text-[10px]">Frota</SortableTh>
              <SortableTh active={sort.key==="driver"} direction={sort.direction} onSort={()=>toggle("driver")} className="py-1 px-2 text-[10px]">Motorista</SortableTh>
              <SortableTh active={sort.key==="owner"} direction={sort.direction} onSort={()=>toggle("owner")} className="py-1 px-2 text-[10px]">Proprietário</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-3 text-[11px] text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-3 text-[11px] text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : sorted.map(v => (
              <TableRow key={v.id} className="h-7">
                <TableCell className="py-1 px-2 font-mono text-[11px] font-medium whitespace-nowrap">{v.plate}</TableCell>
                <TableCell className="py-1 px-2 font-mono text-[11px]">{v.renavam || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{v.brand} {v.model}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{v.year}</TableCell>
                <TableCell className="py-1 px-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">{VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type}</Badge></TableCell>
                <TableCell className="py-1 px-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{getTrailerPlates(v) || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{fleetLabel(v.fleet_type)}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{getName(v.driver_id)}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{getName(v.owner_id)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Cargas Report ───
function CargasReport({ matriz, cnpjsFooter }: { matriz: any; cnpjsFooter: string }) {
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

  const { sort, toggle, sorted } = useSortableTable<any, "produto" | "tipo" | "ncm" | "sinonimos" | "tol" | "status">(
    filtered,
    { key: "produto", direction: "asc" },
    {
      produto: r => (r.produto_predominante || "").toLowerCase(),
      tipo: r => (r.tipo || "").toLowerCase(),
      ncm: r => r.ncm || "",
      sinonimos: r => (r.sinonimos || "").toLowerCase(),
      tol: r => r.tolerancia_quebra ?? -1,
      status: r => (r.ativo ? 1 : 0),
    },
  );

  const getHeaders = () => ["Produto", "Tipo", "NCM", "Sinônimos", "Tolerância Quebra", "Status"];
  const getRows = () => filtered.map(c => [
    c.produto_predominante, c.tipo || "", c.ncm || "", c.sinonimos || "",
    c.tolerancia_quebra != null ? `${c.tolerancia_quebra}%` : "", c.ativo ? "Ativo" : "Inativo",
  ]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input placeholder="Buscar produto, NCM, sinônimos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-[11px]" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {tipos.map(t => <SelectItem key={t} value={t}>{t === "__all__" ? "Todos os tipos" : t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[100px] h-7 text-[11px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_cargas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório de Natureza de Cargas", getHeaders(), getRows(), matriz, cnpjsFooter)}
          disabled={filtered.length === 0}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-7">
              <SortableTh active={sort.key==="produto"} direction={sort.direction} onSort={()=>toggle("produto")} className="py-1 px-2 text-[10px]">Produto</SortableTh>
              <SortableTh active={sort.key==="tipo"} direction={sort.direction} onSort={()=>toggle("tipo")} className="py-1 px-2 text-[10px]">Tipo</SortableTh>
              <SortableTh active={sort.key==="ncm"} direction={sort.direction} onSort={()=>toggle("ncm")} className="py-1 px-2 text-[10px]">NCM</SortableTh>
              <SortableTh active={sort.key==="sinonimos"} direction={sort.direction} onSort={()=>toggle("sinonimos")} className="py-1 px-2 text-[10px]">Sinônimos</SortableTh>
              <SortableTh active={sort.key==="tol"} direction={sort.direction} onSort={()=>toggle("tol")} className="py-1 px-2 text-[10px]">Toler. Quebra</SortableTh>
              <SortableTh active={sort.key==="status"} direction={sort.direction} onSort={()=>toggle("status")} className="py-1 px-2 text-[10px]">Status</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-3 text-[11px] text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-3 text-[11px] text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : sorted.map(c => (
              <TableRow key={c.id} className="h-7">
                <TableCell className="py-1 px-2 text-[11px] font-medium">{c.produto_predominante}</TableCell>
                <TableCell className="py-1 px-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">{c.tipo || "—"}</Badge></TableCell>
                <TableCell className="py-1 px-2 font-mono text-[11px]">{c.ncm || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px] max-w-[200px] truncate">{c.sinonimos || "—"}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{c.tolerancia_quebra != null ? `${c.tolerancia_quebra}%` : "—"}</TableCell>
                <TableCell className="py-1 px-2">
                  <Badge variant={c.ativo ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 leading-tight">{c.ativo ? "Ativo" : "Inativo"}</Badge>
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
function PlanoContasReport({ matriz, cnpjsFooter }: { matriz: any; cnpjsFooter: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    // Plano de contas é único/unificado entre as empresas
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("*")
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

  const { sort, toggle, sorted } = useSortableTable<any, "codigo" | "nome" | "caminho" | "tipo" | "nivel" | "tipoOper" | "status">(
    filtered,
    { key: "codigo", direction: "asc" },
    {
      codigo: r => r.codigo || "",
      nome: r => (r.nome || "").toLowerCase(),
      caminho: r => getParentPath(r).toLowerCase(),
      tipo: r => r.tipo || "",
      nivel: r => Number(r.nivel) || 0,
      tipoOper: r => r.tipo_operacional || "",
      status: r => (r.ativo ? 1 : 0),
    },
  );

  const getHeaders = () => ["Código", "Nome", "Tipo", "Nível", "Tipo Operacional", "Caminho", "Status"];
  const getRows = () => filtered.map(c => [
    c.codigo, c.nome, c.tipo, String(c.nivel),
    c.tipo_operacional || "", getParentPath(c), c.ativo ? "Ativo" : "Inativo",
  ]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input placeholder="Buscar código ou nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-[11px]" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[120px] h-7 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[100px] h-7 text-[11px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <ExportButtons
          onCsv={() => downloadCsv("relatorio_plano_contas.csv", getHeaders(), getRows())}
          onPdf={() => printPdf("Relatório do Plano de Contas", getHeaders(), getRows(), matriz, cnpjsFooter)}
          disabled={filtered.length === 0}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">{filtered.length} registro(s)</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-7">
              <SortableTh active={sort.key==="codigo"} direction={sort.direction} onSort={()=>toggle("codigo")} className="py-1 px-2 text-[10px]">Código</SortableTh>
              <SortableTh active={sort.key==="nome"} direction={sort.direction} onSort={()=>toggle("nome")} className="py-1 px-2 text-[10px]">Nome</SortableTh>
              <SortableTh active={sort.key==="caminho"} direction={sort.direction} onSort={()=>toggle("caminho")} className="py-1 px-2 text-[10px]">Caminho</SortableTh>
              <SortableTh active={sort.key==="tipo"} direction={sort.direction} onSort={()=>toggle("tipo")} className="py-1 px-2 text-[10px]">Tipo</SortableTh>
              <SortableTh active={sort.key==="nivel"} direction={sort.direction} onSort={()=>toggle("nivel")} className="py-1 px-2 text-[10px]">Nível</SortableTh>
              <SortableTh active={sort.key==="tipoOper"} direction={sort.direction} onSort={()=>toggle("tipoOper")} className="py-1 px-2 text-[10px]">Tipo Oper.</SortableTh>
              <SortableTh active={sort.key==="status"} direction={sort.direction} onSort={()=>toggle("status")} className="py-1 px-2 text-[10px]">Status</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-3 text-[11px] text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-3 text-[11px] text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : sorted.map(c => (
              <TableRow key={c.id} className="h-7">
                <TableCell className="py-1 px-2 font-mono text-[11px] font-medium">{c.codigo}</TableCell>
                <TableCell className="py-1 px-2 text-[11px] font-medium">{c.nome}</TableCell>
                <TableCell className="py-1 px-2 text-[11px] text-muted-foreground max-w-[200px] truncate">{getParentPath(c) || "—"}</TableCell>
                <TableCell className="py-1 px-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">{c.tipo}</Badge></TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{c.nivel}</TableCell>
                <TableCell className="py-1 px-2 text-[11px]">{c.tipo_operacional || "—"}</TableCell>
                <TableCell className="py-1 px-2">
                  <Badge variant={c.ativo ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 leading-tight">{c.ativo ? "Ativo" : "Inativo"}</Badge>
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
  const { matriz, unifiedCnpjsPipe } = useUnifiedCompany();
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
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Relatórios de Cadastros</h1>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ReportType)}>
          <TabsList className="flex-wrap h-auto gap-1">
            {REPORT_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs h-8 px-2.5">
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="pt-3 pb-3 px-3">
            {activeTab === "pessoas" && <PeopleReport matriz={matriz} cnpjsFooter={unifiedCnpjsPipe} />}
            {activeTab === "veiculos" && <VehiclesReport matriz={matriz} cnpjsFooter={unifiedCnpjsPipe} />}
            {activeTab === "cargas" && <CargasReport matriz={matriz} cnpjsFooter={unifiedCnpjsPipe} />}
            {activeTab === "plano_contas" && <PlanoContasReport matriz={matriz} cnpjsFooter={unifiedCnpjsPipe} />}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
