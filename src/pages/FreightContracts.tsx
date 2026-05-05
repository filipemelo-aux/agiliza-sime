import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileSignature, Printer, ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/masks";
import { Link } from "react-router-dom";
import { buildFullContractHtml, openPrintWindow } from "@/components/freight/freightContractPrint";

interface FreightContractRow {
  id: string;
  numero: number;
  data_contrato: string;
  contratado_nome: string;
  contratado_documento: string | null;
  contratado_tipo: string;
  contratado_id: string | null;
  motorista_id: string | null;
  motorista_cpf: string | null;
  vehicle_id: string | null;
  motorista_nome: string | null;
  placa_veiculo: string | null;
  veiculo_modelo: string | null;
  municipio_origem: string | null;
  uf_origem: string | null;
  municipio_destino: string | null;
  uf_destino: string | null;
  natureza_carga: string | null;
  peso_kg: number;
  valor_tonelada: number;
  valor_total: number;
  observacoes: string | null;
  cte_id: string;
  accounts_payable_id: string | null;
  cte?: { numero: number | null; serie: number | null; tipo_talao?: string | null } | null;
  payable?: { status: string; data_pagamento: string | null } | null;
}

export default function FreightContracts() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FreightContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("freight_contracts")
        .select(`
          id, numero, data_contrato,
          contratado_id, contratado_nome, contratado_documento, contratado_tipo,
          motorista_id, motorista_nome, motorista_cpf,
          vehicle_id, placa_veiculo, veiculo_modelo,
          municipio_origem, uf_origem, municipio_destino, uf_destino,
          natureza_carga, peso_kg, valor_tonelada, valor_total, observacoes,
          cte_id, accounts_payable_id,
          cte:ctes!freight_contracts_cte_id_fkey(numero, serie, tipo_talao),
          payable:expenses!freight_contracts_accounts_payable_id_fkey(status, data_pagamento)
        `)
        .order("numero", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar contratos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos") {
        const st = r.payable?.status || "sem_titulo";
        if (statusFilter !== st) return false;
      }
      if (dateFrom && r.data_contrato < dateFrom) return false;
      if (dateTo && r.data_contrato > dateTo) return false;
      if (!s) return true;
      const hay = [
        String(r.numero),
        r.contratado_nome,
        r.contratado_documento,
        r.motorista_nome,
        r.placa_veiculo,
        r.municipio_origem,
        r.municipio_destino,
        r.natureza_carga,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search, statusFilter, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const totalValor = filtered.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);
    const totalPeso = filtered.reduce((sum, r) => sum + Number(r.peso_kg || 0), 0);
    return { totalValor, totalPeso, count: filtered.length };
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("todos");
    setDateFrom("");
    setDateTo("");
  };

  const handlePrint = async (r: FreightContractRow) => {
    const html = await buildFullContractHtml({
      numero: r.numero,
      data_contrato: r.data_contrato,
      contratado_id: (r as any).contratado_id ?? null,
      contratado_nome: r.contratado_nome,
      contratado_documento: r.contratado_documento,
      contratado_tipo: r.contratado_tipo,
      motorista_id: (r as any).motorista_id ?? null,
      motorista_nome: r.motorista_nome,
      motorista_cpf: (r as any).motorista_cpf ?? null,
      vehicle_id: (r as any).vehicle_id ?? null,
      placa_veiculo: r.placa_veiculo,
      veiculo_modelo: r.veiculo_modelo,
      municipio_origem: r.municipio_origem,
      uf_origem: r.uf_origem,
      municipio_destino: r.municipio_destino,
      uf_destino: r.uf_destino,
      natureza_carga: r.natureza_carga,
      peso_kg: Number(r.peso_kg) || 0,
      valor_tonelada: Number(r.valor_tonelada) || 0,
      valor_total: Number(r.valor_total) || 0,
      observacoes: r.observacoes,
      cte: r.cte ? { numero: r.cte.numero, serie: r.cte.serie, tipo_talao: r.cte.tipo_talao } : null,
    });
    openPrintWindow(html);
  };

  const renderPayableStatus = (r: FreightContractRow) => {
    const st = r.payable?.status;
    if (!st) return <Badge variant="outline">Sem título</Badge>;
    const map: Record<string, string> = {
      pago: "bg-emerald-500/10 text-emerald-600",
      pendente: "bg-amber-500/10 text-amber-600",
      atrasado: "bg-destructive/10 text-destructive",
      parcial: "bg-blue-500/10 text-blue-600",
      cancelado: "bg-muted text-muted-foreground",
    };
    return <Badge className={map[st] || ""}>{st}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileSignature className="w-5 h-5" /> Contratos de Frete
            </h1>
            <p className="text-xs text-muted-foreground">
              Contratos de fretamento vinculados a CT-e com geração de conta a pagar.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-4 relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Nº, contratado, motorista, placa, trecho..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status do pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="sem_titulo">Sem título</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Input
                  type="date"
                  className="h-9"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="Data inicial"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  type="date"
                  className="h-9"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Data final"
                />
              </div>
              <div className="md:col-span-1">
                <Button variant="outline" className="h-9 w-full gap-1" onClick={clearFilters}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-2">
              <span><b>{totals.count}</b> contrato(s)</span>
              <span>Peso total: <b>{(totals.totalPeso / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</b></span>
              <span>Valor total: <b className="text-foreground">{formatCurrency(totals.totalValor)}</b></span>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-10">Carregando...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum contrato encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((r) => (
              <Card key={r.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Contrato</div>
                      <div className="font-semibold text-base">Nº {String(r.numero).padStart(6, "0")}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(r.data_contrato + "T12:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    {renderPayableStatus(r)}
                  </div>

                  <div className="text-sm">
                    <div className="font-medium truncate">{r.contratado_nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.contratado_tipo} {r.contratado_documento ? `· ${r.contratado_documento}` : ""}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
                    <div>
                      <b>Trecho:</b> {r.municipio_origem || "-"}/{r.uf_origem || "--"} → {r.municipio_destino || "-"}/{r.uf_destino || "--"}
                    </div>
                    <div>
                      <b>Motorista:</b> {r.motorista_nome || "-"} · <b>Placa:</b> {r.placa_veiculo || "-"}
                    </div>
                    <div>
                      <b>Peso:</b> {(Number(r.peso_kg) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t · <b>R$/t:</b> {formatCurrency(r.valor_tonelada)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-2">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
                      <div className="font-semibold text-primary">{formatCurrency(r.valor_total)}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => handlePrint(r)}>
                        <Printer className="w-3.5 h-3.5" /> Imprimir
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1" asChild>
                        <Link to="/admin/freight/cte" title="Ver CT-e vinculado">
                          <ExternalLink className="w-3.5 h-3.5" /> CT-e
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

