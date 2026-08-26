import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskCurrency, unmaskCurrency, formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";

export type TipoDocumentoVeiculo = "IPVA" | "Licenciamento" | "Multa" | "Seguro";
export type StatusPagamentoDocumento = "A Vencer" | "Vencido" | "Pago";

export interface VeiculoDocumento {
  id: string;
  veiculo_id: string;
  tipo_documento: TipoDocumentoVeiculo;
  ano_exercicio: number;
  valor_total: number;
  data_vencimento: string;
  status_pagamento: StatusPagamentoDocumento;
  observacoes: string | null;
}

const TIPOS: TipoDocumentoVeiculo[] = ["IPVA", "Licenciamento", "Multa", "Seguro"];
const STATUS: StatusPagamentoDocumento[] = ["A Vencer", "Vencido", "Pago"];

export function statusBadgeClass(status: StatusPagamentoDocumento) {
  switch (status) {
    case "Pago":
      return "bg-success/15 text-success border-success/30";
    case "Vencido":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-warning/15 text-warning border-warning/30";
  }
}

interface Props {
  vehicleId: string | null | undefined;
  readOnly?: boolean;
}

const emptyDoc = {
  tipo_documento: "IPVA" as TipoDocumentoVeiculo,
  ano_exercicio: String(new Date().getFullYear()),
  valor_total: "",
  data_vencimento: "",
  status_pagamento: "A Vencer" as StatusPagamentoDocumento,
  observacoes: "",
};

export function VehicleDocumentsTab({ vehicleId, readOnly = false }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<VeiculoDocumento[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDoc);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("veiculo_documentos")
      .select("*")
      .eq("veiculo_id", vehicleId)
      .order("data_vencimento", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar documentos", description: error.message, variant: "destructive" });
    } else {
      setDocs((data as VeiculoDocumento[]) || []);
    }
    setLoading(false);
  }, [vehicleId, toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyDoc);
    setDialogOpen(true);
  };

  const openEdit = (d: VeiculoDocumento) => {
    setEditingId(d.id);
    setForm({
      tipo_documento: d.tipo_documento,
      ano_exercicio: String(d.ano_exercicio),
      valor_total: maskCurrency(String(Math.round(Number(d.valor_total) * 100))),
      data_vencimento: d.data_vencimento || "",
      status_pagamento: d.status_pagamento,
      observacoes: d.observacoes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!vehicleId) return;
    if (!form.data_vencimento) {
      toast({ title: "Informe a data de vencimento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        veiculo_id: vehicleId,
        tipo_documento: form.tipo_documento,
        ano_exercicio: Number(form.ano_exercicio) || new Date().getFullYear(),
        valor_total: Number(unmaskCurrency(form.valor_total)) || 0,
        data_vencimento: form.data_vencimento,
        status_pagamento: form.status_pagamento,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("veiculo_documentos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("veiculo_documentos")
          .insert([{ ...payload, created_by: user?.id ?? null }] as any);
        if (error) throw error;
      }
      toast({ title: editingId ? "Documento atualizado!" : "Documento cadastrado!" });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("veiculo_documentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Documento excluído" });
    load();
  };

  if (!vehicleId) {
    return (
      <p className="text-xs text-muted-foreground italic py-6 text-center">
        Salve o veículo para cadastrar documentos e taxas.
      </p>
    );
  }

  const total = docs.reduce((s, d) => s + Number(d.valor_total || 0), 0);
  const emAberto = docs.filter(d => d.status_pagamento !== "Pago").reduce((s, d) => s + Number(d.valor_total || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {docs.length} registro(s) • Total {formatCurrency(total)} • Em aberto{" "}
          <span className="font-semibold text-foreground">{formatCurrency(emAberto)}</span>
        </div>
        {!readOnly && (
          <Button size="sm" className="h-8" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Documento/Multa
          </Button>
        )}
      </div>

      <div className="rounded border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Exercício</th>
              <th className="text-right p-2">Valor</th>
              <th className="text-left p-2">Vencimento</th>
              <th className="text-left p-2">Situação</th>
              {!readOnly && <th className="text-right p-2 w-20">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground italic">Nenhum documento registrado.</td></tr>
            ) : docs.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2 font-medium">{d.tipo_documento}</td>
                <td className="p-2">{d.ano_exercicio}</td>
                <td className="p-2 text-right">{formatCurrency(Number(d.valor_total))}</td>
                <td className="p-2">{formatDateBR(d.data_vencimento)}</td>
                <td className="p-2">
                  <Badge variant="outline" className={statusBadgeClass(d.status_pagamento)}>
                    {d.status_pagamento}
                  </Badge>
                </td>
                {!readOnly && (
                  <td className="p-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(d)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Documento" : "Novo Documento/Multa"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.tipo_documento} onValueChange={(v) => setForm(p => ({ ...p, tipo_documento: v as TipoDocumentoVeiculo }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ano de Exercício *</Label>
              <Input
                className="h-9"
                maxLength={4}
                value={form.ano_exercicio}
                onChange={(e) => setForm(p => ({ ...p, ano_exercicio: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor Total</Label>
              <Input
                className="h-9"
                placeholder="0,00"
                value={form.valor_total}
                onChange={(e) => setForm(p => ({ ...p, valor_total: maskCurrency(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento *</Label>
              <Input
                type="date"
                className="h-9"
                value={form.data_vencimento}
                onChange={(e) => setForm(p => ({ ...p, data_vencimento: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Situação</Label>
              <Select value={form.status_pagamento} onValueChange={(v) => setForm(p => ({ ...p, status_pagamento: v as StatusPagamentoDocumento }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
