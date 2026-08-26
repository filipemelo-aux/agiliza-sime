import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { personDisplayName } from "@/lib/personName";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
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
  favorecido_id: string | null;
  expense_id: string | null;
}

const TIPOS: TipoDocumentoVeiculo[] = ["IPVA", "Licenciamento", "Multa", "Seguro"];
const STATUS: StatusPagamentoDocumento[] = ["A Vencer", "Vencido", "Pago"];

const TIPO_DESPESA_MAP: Record<TipoDocumentoVeiculo, string> = {
  IPVA: "imposto",
  Licenciamento: "imposto",
  Multa: "multa",
  Seguro: "outros",
};

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
  vehiclePlate?: string | null;
  readOnly?: boolean;
}

const emptyDoc = {
  tipo_documento: "IPVA" as TipoDocumentoVeiculo,
  ano_exercicio: String(new Date().getFullYear()),
  valor_total: "",
  data_vencimento: "",
  status_pagamento: "A Vencer" as StatusPagamentoDocumento,
  observacoes: "",
  favorecido_id: "",
  favorecido_nome: "",
  gerar_financeiro: true,
};

export function VehicleDocumentsTab({ vehicleId, vehiclePlate, readOnly = false }: Props) {
  const { toast } = useToast();
  const { matrizId } = useUnifiedCompany();
  const [docs, setDocs] = useState<VeiculoDocumento[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDoc);
  const [saving, setSaving] = useState(false);
  const [plate, setPlate] = useState<string>(vehiclePlate || "");

  useEffect(() => {
    if (vehiclePlate) { setPlate(vehiclePlate); return; }
    if (!vehicleId) return;
    supabase.from("vehicles").select("plate").eq("id", vehicleId).maybeSingle()
      .then(({ data }) => setPlate((data as any)?.plate || ""));
  }, [vehicleId, vehiclePlate]);

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
      setDocs((data as unknown as VeiculoDocumento[]) || []);
    }
    setLoading(false);
  }, [vehicleId, toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setEditingExpenseId(null);
    setForm(emptyDoc);
    setDialogOpen(true);
  };

  const openEdit = async (d: VeiculoDocumento) => {
    setEditingId(d.id);
    setEditingExpenseId(d.expense_id);
    let favorecidoNome = "";
    if (d.favorecido_id) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, razao_social, nome_fantasia")
        .eq("id", d.favorecido_id)
        .maybeSingle();
      if (data) favorecidoNome = personDisplayName(data as any);
    }
    setForm({
      tipo_documento: d.tipo_documento,
      ano_exercicio: String(d.ano_exercicio),
      valor_total: maskCurrency(String(Math.round(Number(d.valor_total) * 100))),
      data_vencimento: d.data_vencimento || "",
      status_pagamento: d.status_pagamento,
      observacoes: d.observacoes || "",
      favorecido_id: d.favorecido_id || "",
      favorecido_nome: favorecidoNome,
      gerar_financeiro: !!d.expense_id,
    });
    setDialogOpen(true);
  };

  const buildDescricao = () =>
    `${form.tipo_documento} ${form.ano_exercicio}${plate ? ` - ${plate}` : ""}`;

  const handleSave = async () => {
    if (!vehicleId) return;
    if (!form.data_vencimento) {
      toast({ title: "Informe a data de vencimento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const valor = Number(unmaskCurrency(form.valor_total)) || 0;
      const payload = {
        veiculo_id: vehicleId,
        tipo_documento: form.tipo_documento,
        ano_exercicio: Number(form.ano_exercicio) || new Date().getFullYear(),
        valor_total: valor,
        data_vencimento: form.data_vencimento,
        status_pagamento: form.status_pagamento,
        observacoes: form.observacoes || null,
        favorecido_id: form.favorecido_id || null,
      };

      const { data: { user } } = await supabase.auth.getUser();

      let docId = editingId;
      if (editingId) {
        const { error } = await supabase.from("veiculo_documentos").update(payload as any).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("veiculo_documentos")
          .insert([{ ...payload, created_by: user?.id ?? null }] as any)
          .select("id")
          .single();
        if (error) throw error;
        docId = (data as any).id;
      }

      // Financeiro
      if (form.gerar_financeiro && !editingExpenseId) {
        if (!matrizId) {
          toast({ title: "Documento salvo, mas sem lançamento financeiro", description: "Empresa não identificada.", variant: "destructive" });
        } else {
          const expensePayload: any = {
            empresa_id: matrizId,
            descricao: buildDescricao(),
            tipo_despesa: TIPO_DESPESA_MAP[form.tipo_documento],
            centro_custo: "operacional",
            valor_total: valor,
            data_emissao: new Date().toISOString().slice(0, 10),
            data_vencimento: form.data_vencimento,
            status: form.status_pagamento === "Pago" ? "pago" : "pendente",
            favorecido_id: form.favorecido_id || null,
            favorecido_nome: form.favorecido_nome || null,
            veiculo_id: vehicleId,
            veiculo_placa: plate || null,
            origem: "manual",
            observacoes: form.observacoes || null,
            created_by: user?.id,
          };
          const { data: exp, error: expErr } = await supabase
            .from("expenses").insert(expensePayload).select("id").single();
          if (expErr) throw expErr;
          const { error: linkErr } = await supabase
            .from("veiculo_documentos")
            .update({ expense_id: (exp as any).id } as any)
            .eq("id", docId!);
          if (linkErr) throw linkErr;
        }
      } else if (editingExpenseId) {
        await supabase.from("expenses").update({
          descricao: buildDescricao(),
          valor_total: valor,
          data_vencimento: form.data_vencimento,
          favorecido_id: form.favorecido_id || null,
          favorecido_nome: form.favorecido_nome || null,
        } as any).eq("id", editingExpenseId);
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
    toast({ title: "Documento excluído", description: "O lançamento no Contas a Pagar, se houver, foi mantido." });
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
                <td className="p-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    {d.tipo_documento}
                    {d.expense_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link2 className="h-3.5 w-3.5 text-primary" />
                          </TooltipTrigger>
                          <TooltipContent>Vinculado ao Contas a Pagar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
                </td>
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
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Favorecido / Órgão Autuador</Label>
              <PersonSearchInput
                categories={["fornecedor", "cliente", "banco", "proprietario"]}
                placeholder="Buscar favorecido (Detran, PRF...)"
                selectedName={form.favorecido_nome || undefined}
                onSelect={(p) => setForm(prev => ({ ...prev, favorecido_id: p.id, favorecido_nome: personDisplayName(p) }))}
                onClear={() => setForm(prev => ({ ...prev, favorecido_id: "", favorecido_nome: "" }))}
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
            <div className="col-span-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <Checkbox
                id="doc-gerar-financeiro"
                checked={form.gerar_financeiro}
                disabled={!!editingExpenseId}
                onCheckedChange={(c) => setForm(p => ({ ...p, gerar_financeiro: !!c }))}
              />
              <div className="space-y-0.5">
                <Label htmlFor="doc-gerar-financeiro" className="text-xs font-medium cursor-pointer">
                  Gerar lançamento no Contas a Pagar
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {editingExpenseId
                    ? "Já existe lançamento vinculado — as alterações serão replicadas."
                    : "Cria a despesa vinculada ao veículo com o favorecido e vencimento informados."}
                </p>
              </div>
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
