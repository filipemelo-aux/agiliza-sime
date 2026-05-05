import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, FileText, FileCheck2, FileCog, ScrollText, Trash2, Loader2, X, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR, normalizeDateInput } from "@/lib/date";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { cancelarCte } from "@/services/fiscal";
import { CteFormDialog } from "@/components/freight/CteFormDialog";
import { CteServicoFormDialog } from "@/components/freight/CteServicoFormDialog";
import { CteDetailDialog } from "@/components/freight/CteDetailDialog";


export interface Cte {
  id: string;
  numero: number | null;
  serie: number;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  status: string;
  tomador_id: string | null;
  remetente_nome: string;
  destinatario_nome: string;
  valor_frete: number;
  cfop: string;
  natureza_operacao: string;
  municipio_origem_nome: string | null;
  uf_origem: string | null;
  municipio_destino_nome: string | null;
  uf_destino: string | null;
  placa_veiculo: string | null;
  motorista_id: string | null;
  data_emissao: string | null;
  data_autorizacao: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  tipo_talao?: string;
  numero_interno?: number | null;
  data_carregamento?: string | null;
  valor_tonelada?: number | null;
  [key: string]: any;
}

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  autorizado: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  rejeitado: "bg-amber-500/10 text-amber-600",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  autorizado: "Autorizado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
};

export default function FreightCte() {
  const [ctes, setCtes] = useState<Cte[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "producao" | "servico">("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [servicoOpen, setServicoOpen] = useState(false);
  
  const [editingCte, setEditingCte] = useState<Cte | null>(null);
  const [detailCte, setDetailCte] = useState<Cte | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCtes();
  }, []);

  const fetchCtes = async () => {
    try {
      const { data, error } = await supabase
        .from("ctes")
        .select("*")
        .order("data_emissao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCtes((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getEmissaoDate = (c: Cte) => c.data_emissao || c.created_at;

  const filtered = ctes.filter((c) => {
    const isServico = c.tipo_talao === "servico";
    if (tipoFilter === "producao" && isServico) return false;
    if (tipoFilter === "servico" && !isServico) return false;

    const emissao = normalizeDateInput(getEmissaoDate(c));
    if (dateFrom && (!emissao || emissao < dateFrom)) return false;
    if (dateTo && (!emissao || emissao > dateTo)) return false;

    const q = search.toLowerCase();
    return (
      !q ||
      c.remetente_nome?.toLowerCase().includes(q) ||
      c.destinatario_nome?.toLowerCase().includes(q) ||
      String(c.numero).includes(q) ||
      String(c.numero_interno).includes(q) ||
      c.chave_acesso?.includes(q)
    );
  });

  const handleNew = () => {
    setEditingCte(null);
    setChooserOpen(true);
  };

  const handlePickProducao = () => {
    setChooserOpen(false);
    setFormOpen(true);
  };

  const handlePickServico = () => {
    setChooserOpen(false);
    setServicoOpen(true);
  };

  const handleEdit = (cte: Cte) => {
    setEditingCte(cte);
    if (cte.tipo_talao === "servico") {
      setServicoOpen(true);
    } else {
      setFormOpen(true);
    }
  };

  const handleDelete = async (cte: Cte) => {
    const isServico = cte.tipo_talao === "servico";
    const isAutorizado = cte.status === "autorizado" && !!cte.chave_acesso && !!cte.protocolo_autorizacao;

    // CT-e de Produção AUTORIZADO → precisa cancelar na SEFAZ antes
    if (!isServico && isAutorizado) {
      const ok = await confirm({
        title: "Cancelar CT-e na SEFAZ e excluir",
        description:
          `Este CT-e (Nº ${cte.numero}) está autorizado pela SEFAZ.\n\n` +
          `Será solicitado o CANCELAMENTO oficial na SEFAZ e, em seguida, o registro será excluído do sistema.\n\n` +
          `Esta operação é IRREVERSÍVEL. Deseja continuar?`,
        confirmLabel: "Cancelar na SEFAZ e excluir",
        variant: "destructive",
      });
      if (!ok) return;

      const justificativa = window.prompt(
        "Justificativa para cancelamento na SEFAZ (mínimo 15 caracteres):",
        "Cancelamento solicitado pelo emitente"
      );
      if (!justificativa) return;
      if (justificativa.trim().length < 15) {
        toast({
          title: "Justificativa inválida",
          description: "A SEFAZ exige no mínimo 15 caracteres.",
          variant: "destructive",
        });
        return;
      }

      setDeletingId(cte.id);
      try {
        const resp = await cancelarCte(
          cte.id,
          cte.chave_acesso!,
          cte.protocolo_autorizacao!,
          justificativa.trim(),
          user?.id || "",
          cte.establishment_id
        );
        if (!resp.success) {
          toast({
            title: "Falha no cancelamento SEFAZ",
            description: resp.motivo_rejeicao || "Não foi possível cancelar o CT-e na SEFAZ. Exclusão abortada.",
            variant: "destructive",
          });
          return;
        }
        // Cancelado com sucesso → excluir registro
        const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
        if (error) throw error;
        toast({ title: "CT-e cancelado e excluído", description: `Nº ${cte.numero} foi cancelado na SEFAZ e removido do sistema.` });
        fetchCtes();
      } catch (err: any) {
        toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
      return;
    }

    // Serviço, rascunho, rejeitado, erro ou cancelado → exclusão direta
    const ok = await confirm({
      title: "Excluir CT-e",
      description: isServico
        ? `Excluir definitivamente este talão de serviço?\n\nEsta ação não pode ser desfeita.`
        : `Este CT-e não foi autorizado pela SEFAZ (status: ${cte.status}). Excluir definitivamente?\n\nEsta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingId(cte.id);
    try {
      const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
      if (error) throw error;
      toast({ title: "CT-e excluído", description: "Registro removido com sucesso." });
      fetchCtes();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold font-display">CT-e</h1>
          <div className="flex items-center gap-2">
            <Button onClick={handleNew} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo CT-e
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:flex-wrap gap-3 mb-6">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, remetente, destinatário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Emissão de</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Emissão até</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 w-[160px]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="h-10 gap-1 text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" /> Limpar
            </Button>
          )}
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 w-fit ml-auto">
            {([
              { v: "todos", label: "Todos" },
              { v: "producao", label: "Produção" },
              { v: "servico", label: "Serviço" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setTipoFilter(opt.v)}
                className={`px-3 h-8 text-xs rounded-sm transition-colors ${
                  tipoFilter === opt.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>


        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum CT-e encontrado</h3>
            <p className="text-muted-foreground">Clique em "Novo CT-e" para criar o primeiro.</p>
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium w-10"></th>
                    <th className="px-3 py-2 font-medium">N.º</th>
                    <th className="px-3 py-2 font-medium">Talão</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Data Emissão</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    
                    <th className="px-3 py-2 font-medium">Placa</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium text-right">Status</th>
                    <th className="px-3 py-2 font-medium text-right w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cte) => {
                    const isServico = cte.tipo_talao === "servico";
                    const numeroDisplay = isServico
                      ? cte.numero_interno ?? "—"
                      : cte.numero ?? "—";
                    const cliente = isServico
                      ? cte.destinatario_nome
                      : cte.destinatario_nome || cte.remetente_nome;
                    return (
                      <tr
                        key={cte.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDetailCte(cte)}
                      >
                        <td className="px-3 py-2">
                          {isServico ? (
                            <ScrollText className="h-4 w-4 text-amber-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium tabular-nums">{numeroDisplay}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {isServico ? "Serviço" : "Produção"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {formatDateBR(getEmissaoDate(cte))}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[220px]">{cliente}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {cte.placa_veiculo || "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium">
                          {Number(cte.valor_frete).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isServico ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-700">Interno</Badge>
                          ) : (
                            <Badge className={statusColors[cte.status] || ""}>
                              {statusLabels[cte.status] || cte.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(isServico || cte.status === "rascunho" || cte.status === "rejeitado") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); handleEdit(cte); }}
                              >
                                Editar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deletingId === cte.id}
                              onClick={(e) => { e.stopPropagation(); handleDelete(cte); }}
                              title={!isServico && cte.status === "autorizado" ? "Cancelar na SEFAZ e excluir" : "Excluir CT-e"}
                            >
                              {deletingId === cte.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Chooser modal */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo CT-e</DialogTitle>
            <DialogDescription>Selecione o talão ao qual este CT-e pertence.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-2">
            <button
              type="button"
              onClick={handlePickProducao}
              className="text-left border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Produção</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CT-e fiscal completo, transmitido à SEFAZ.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handlePickServico}
              className="text-left border rounded-lg p-4 hover:border-amber-500 hover:bg-amber-500/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <FileCog className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Serviço</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registro interno simplificado, sem envio à SEFAZ.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CteFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      <CteServicoFormDialog
        open={servicoOpen}
        onOpenChange={(o) => { setServicoOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      {detailCte && (
        <CteDetailDialog
          open={!!detailCte}
          onOpenChange={(open) => !open && setDetailCte(null)}
          cte={detailCte}
          onUpdated={fetchCtes}
          onEdit={(cte) => {
            setDetailCte(null);
            handleEdit(cte);
          }}
        />
      )}
      {ConfirmDialog}
    </AdminLayout>
  );
}
