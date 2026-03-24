import { useState, useEffect, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Wrench, Car, DollarSign, Eye, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";


interface Maintenance {
  id: string;
  veiculo_id: string;
  expense_id: string | null;
  nfse_expense_id: string | null;
  data_manutencao: string;
  odometro: number;
  tipo_manutencao: string;
  descricao: string;
  custo_total: number;
  fornecedor: string | null;
  status: string;
  proxima_manutencao_km: number | null;
  data_proxima_manutencao: string | null;
  created_at: string;
}

interface Vehicle { id: string; plate: string; brand: string; model: string; }

interface ExpenseDetail {
  id: string;
  descricao: string;
  valor_total: number;
  data_emissao: string;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  favorecido_nome: string | null;
  status: string;
  forma_pagamento: string | null;
  fornecedor_cnpj: string | null;
}

interface MaintenanceItemDetail {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo: string;
}

interface InstallmentDetail {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  realizada: { label: "Realizada", variant: "default" },
  pendente: { label: "Pendente", variant: "secondary" },
};

export default function AdminMaintenances() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVeiculo, setFilterVeiculo] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMaint, setDetailMaint] = useState<Maintenance | null>(null);
  const [nfeExpense, setNfeExpense] = useState<ExpenseDetail | null>(null);
  const [nfseExpense, setNfseExpense] = useState<ExpenseDetail | null>(null);
  const [maintItems, setMaintItems] = useState<MaintenanceItemDetail[]>([]);
  const [nfeInstallments, setNfeInstallments] = useState<InstallmentDetail[]>([]);
  const [nfseInstallments, setNfseInstallments] = useState<InstallmentDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: mData }, { data: vData }] = await Promise.all([
      supabase.from("maintenances" as any).select("*").order("data_manutencao", { ascending: false }),
      supabase.from("vehicles").select("id, plate, brand, model").eq("is_active", true),
    ]);
    setItems((mData as any) || []);
    setVehicles((vData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const vehicleMap = useMemo(() => {
    const m: Record<string, Vehicle> = {};
    vehicles.forEach(v => { m[v.id] = v; });
    return m;
  }, [vehicles]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      const v = vehicleMap[i.veiculo_id];
      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (v?.plate || "").toLowerCase().includes(search.toLowerCase()) ||
        (i.fornecedor || "").toLowerCase().includes(search.toLowerCase());
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchTipo = filterTipo === "all" || i.tipo_manutencao === filterTipo;
      return matchSearch && matchVeiculo && matchTipo;
    });
  }, [items, search, filterVeiculo, filterTipo, vehicleMap]);

  const totalCusto = filtered.reduce((s, i) => s + Number(i.custo_total), 0);

  const openDetail = async (maint: Maintenance) => {
    setDetailMaint(maint);
    setDetailOpen(true);
    setDetailLoading(true);
    setNfeExpense(null);
    setNfseExpense(null);
    setMaintItems([]);
    setNfeInstallments([]);
    setNfseInstallments([]);

    const promises: Promise<any>[] = [];

    // Fetch NFe expense + items + installments
    if (maint.expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", maint.expense_id).maybeSingle(),
          supabase.from("expense_maintenance_items" as any).select("*").eq("expense_id", maint.expense_id),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", maint.expense_id).order("numero_parcela"),
        ]).then(([{ data: nfe }, { data: items }, { data: inst }]) => {
          setNfeExpense(nfe as any);
          setMaintItems((items as any) || []);
          setNfeInstallments((inst as any) || []);
        })
      );
    }

    // Fetch NFSe expense + installments
    if (maint.nfse_expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", maint.nfse_expense_id).maybeSingle(),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", maint.nfse_expense_id).order("numero_parcela"),
        ]).then(([{ data: nfse }, { data: inst }]) => {
          setNfseExpense(nfse as any);
          setNfseInstallments((inst as any) || []);
        })
      );
    }

    await Promise.all(promises);
    setDetailLoading(false);
  };

  // Find NFSe date for display on card
  const getNfseInfo = (maint: Maintenance) => {
    return maint.nfse_expense_id ? true : false;
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Manutenções</h1>
          <Button size="sm" onClick={() => navigate("/admin/financial/payables")} variant="outline" className="gap-1.5 text-xs">
            <Wrench className="h-3.5 w-3.5" /> Nova via Contas a Pagar
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Registros</p>
              <p className="text-xl font-bold text-foreground">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-warning">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Custo Total</p>
              <p className="text-xl font-bold text-foreground">R$ {totalCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className="hidden md:block border-l-4 border-l-success">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Veículos Atendidos</p>
              <p className="text-xl font-bold text-foreground">{new Set(filtered.map(i => i.veiculo_id)).size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por descrição, placa ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filterVeiculo} onValueChange={setFilterVeiculo}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="corretiva">Corretiva</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma manutenção encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">Crie uma despesa de manutenção em Contas a Pagar para registrar automaticamente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(item => {
              const v = vehicleMap[item.veiculo_id];
              const hasNfse = getNfseInfo(item);
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(item)}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{v?.plate || "—"}</p>
                          {v && <p className="text-[11px] text-muted-foreground">{v.brand} {v.model}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {item.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}
                        </Badge>
                        <Badge variant={STATUS_MAP[item.status]?.variant || "outline"} className="text-[10px]">
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-foreground line-clamp-2">{item.descricao}</p>
                    {item.fornecedor && <p className="text-xs text-muted-foreground">Fornecedor: {item.fornecedor}</p>}

                    {/* Docs badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.expense_id && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <FileText className="h-3 w-3" /> NFe
                        </Badge>
                      )}
                      {hasNfse && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <FileText className="h-3 w-3" /> NFSe
                        </Badge>
                      )}
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Data</span>
                        <p className="font-medium text-foreground">{format(new Date(item.data_manutencao + "T12:00:00"), "dd/MM/yyyy")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">KM</span>
                        <p className="font-mono font-medium text-foreground">{Number(item.odometro).toLocaleString("pt-BR")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Custo Total</span>
                        <p className="font-mono font-semibold text-foreground">
                          R$ {Number(item.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-1 border-t border-border flex items-center justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={(e) => { e.stopPropagation(); openDetail(item); }}>
                        <Eye className="h-3.5 w-3.5" /> Detalhes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 shrink-0" /> Detalhes da Manutenção
              </DialogTitle>
            </DialogHeader>

            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : detailMaint && (
              <div className="space-y-4 min-w-0">
                {/* Vehicle + General Info */}
                <Card>
                  <CardContent className="p-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-foreground truncate">
                        {vehicleMap[detailMaint.veiculo_id]?.plate || "—"} — {vehicleMap[detailMaint.veiculo_id]?.brand} {vehicleMap[detailMaint.veiculo_id]?.model}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium text-foreground">{detailMaint.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}</span></div>
                      <div><span className="text-muted-foreground">Data:</span> <span className="font-medium text-foreground">{format(new Date(detailMaint.data_manutencao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                      <div><span className="text-muted-foreground">KM:</span> <span className="font-mono font-medium text-foreground">{Number(detailMaint.odometro).toLocaleString("pt-BR")}</span></div>
                      <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-semibold text-foreground">R$ {Number(detailMaint.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                      {detailMaint.fornecedor && <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{detailMaint.fornecedor}</span></div>}
                      {detailMaint.proxima_manutencao_km && <div><span className="text-muted-foreground">Próx. KM:</span> <span className="font-mono text-foreground">{Number(detailMaint.proxima_manutencao_km).toLocaleString("pt-BR")}</span></div>}
                      {detailMaint.data_proxima_manutencao && <div><span className="text-muted-foreground">Próx. Data:</span> <span className="text-foreground">{format(new Date(detailMaint.data_proxima_manutencao + "T12:00:00"), "dd/MM/yyyy")}</span></div>}
                    </div>
                    <p className="text-xs text-foreground mt-1 break-words">{detailMaint.descricao}</p>
                  </CardContent>
                </Card>

                {/* NFe (Peças) */}
                {nfeExpense && (
                  <Card className="border-l-4 border-l-primary">
                    <CardContent className="p-3 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-xs text-foreground truncate">NFe — Peças / Materiais</span>
                        <Badge variant={nfeExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                          {nfeExpense.status === "pago" ? "Pago" : nfeExpense.status === "pendente" ? "Pendente" : nfeExpense.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="truncate"><span className="text-muted-foreground">Nº Doc:</span> <span className="text-foreground">{nfeExpense.documento_fiscal_numero || "—"}</span></div>
                        <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{format(new Date(nfeExpense.data_emissao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                        <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{nfeExpense.favorecido_nome || "—"}</span></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> R$ {Number(nfeExpense.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                      </div>

                      {/* Itens de peças */}
                      {maintItems.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Itens ({maintItems.length})</p>
                          <div className="border rounded-md divide-y max-h-[150px] overflow-y-auto">
                            {maintItems.map((mi) => (
                              <div key={mi.id} className="flex items-center gap-1 p-2 text-xs min-w-0">
                                <span className="text-foreground truncate flex-1 min-w-0">{mi.descricao}</span>
                                <span className="text-muted-foreground shrink-0">{mi.quantidade}x</span>
                                <span className="font-mono text-foreground shrink-0">R${Number(mi.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* NFSe (Serviço) */}
                {nfseExpense && (
                  <Card className="border-l-4 border-l-accent">
                    <CardContent className="p-3 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-accent-foreground shrink-0" />
                        <span className="font-semibold text-xs text-foreground truncate">NFSe — Serviço / OS</span>
                        <Badge variant={nfseExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                          {nfseExpense.status === "pago" ? "Pago" : nfseExpense.status === "pendente" ? "Pendente" : nfseExpense.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="truncate"><span className="text-muted-foreground">Nº NFSe:</span> <span className="text-foreground">{nfseExpense.documento_fiscal_numero || "—"}</span></div>
                        <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{format(new Date(nfseExpense.data_emissao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                        <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{nfseExpense.favorecido_nome || "—"}</span></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> R$ {Number(nfseExpense.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                      </div>
                      <p className="text-xs text-muted-foreground break-words">{nfseExpense.descricao}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Custo consolidado */}
                {nfeExpense && nfseExpense && (
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Resumo Consolidado</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">NFe (Peças):</span>
                      <span className="font-mono text-foreground">R$ {Number(nfeExpense.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">NFSe (Serviço):</span>
                      <span className="font-mono text-foreground">R$ {Number(nfseExpense.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
                      <span className="text-foreground">Total:</span>
                      <span className="font-mono text-foreground">R$ {Number(detailMaint.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                {/* Installments */}
                {nfeExpense && (
                  <Card className="border border-border">
                    <CardContent className="p-3 space-y-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFe</p>
                      {nfeInstallments.length > 0 ? (
                        <div className="divide-y max-h-[120px] overflow-y-auto">
                          {nfeInstallments.map(inst => (
                            <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                              <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                              <span className="text-muted-foreground truncate">{format(new Date(inst.data_vencimento + "T12:00:00"), "dd/MM/yy")}</span>
                              <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                              <span className="font-mono text-foreground shrink-0">R${Number(inst.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem parcelas</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {nfseExpense && (
                  <Card className="border border-border">
                    <CardContent className="p-3 space-y-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFSe</p>
                      {nfseInstallments.length > 0 ? (
                        <div className="divide-y max-h-[120px] overflow-y-auto">
                          {nfseInstallments.map(inst => (
                            <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                              <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                              <span className="text-muted-foreground truncate">{format(new Date(inst.data_vencimento + "T12:00:00"), "dd/MM/yy")}</span>
                              <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                              <span className="font-mono text-foreground shrink-0">R${Number(inst.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem parcelas</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
