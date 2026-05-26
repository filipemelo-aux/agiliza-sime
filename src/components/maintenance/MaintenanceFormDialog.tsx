import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { MaintenanceFields, MaintenanceItem } from "@/components/financial/MaintenanceFields";
import { maskName, formatCurrency } from "@/lib/masks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** When editing an existing maintenance without expense link */
  editId?: string | null;
}

export function MaintenanceFormDialog({ open, onOpenChange, onSaved, editId }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Maintenance fields
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [kmAtual, setKmAtual] = useState("");
  const [tipoManutencao, setTipoManutencao] = useState("corretiva");
  const [descricaoServico, setDescricaoServico] = useState("");
  const [tipoServico, setTipoServico] = useState("interno");
  const [tempoParado, setTempoParado] = useState("");
  const [proximaManutencaoKm, setProximaManutencaoKm] = useState("");
  const [dataProximaManutencao, setDataProximaManutencao] = useState("");
  const [itensManutencao, setItensManutencao] = useState<MaintenanceItem[]>([]);
  const [total, setTotal] = useState(0);

  const [dataManutencao, setDataManutencao] = useState(() => new Date().toISOString().slice(0, 10));
  const [fornecedor, setFornecedor] = useState("");
  const [gerarDespesa, setGerarDespesa] = useState(false);
  const [dataVencimento, setDataVencimento] = useState("");

  // Revisão (review) data
  const [vehicleIntervalo, setVehicleIntervalo] = useState<number | null>(null);
  const [vehicleProximaRevisao, setVehicleProximaRevisao] = useState<number | null>(null);
  const [revisaoDialogOpen, setRevisaoDialogOpen] = useState(false);
  const [revisaoIntervaloInput, setRevisaoIntervaloInput] = useState("");

  const reset = () => {
    setVeiculoId(null); setKmAtual(""); setTipoManutencao("corretiva");
    setDescricaoServico(""); setTipoServico("interno"); setTempoParado("");
    setProximaManutencaoKm(""); setDataProximaManutencao("");
    setItensManutencao([]); setTotal(0);
    setDataManutencao(new Date().toISOString().slice(0, 10));
    setFornecedor(""); setGerarDespesa(false); setDataVencimento("");
    setVehicleIntervalo(null); setVehicleProximaRevisao(null);
    setRevisaoDialogOpen(false); setRevisaoIntervaloInput("");
  };

  // Load vehicle revision settings when veiculoId changes
  useEffect(() => {
    if (!veiculoId) { setVehicleIntervalo(null); setVehicleProximaRevisao(null); return; }
    supabase.from("vehicles").select("intervalo_revisao_km, proxima_revisao_km").eq("id", veiculoId).maybeSingle().then(({ data }) => {
      const d = data as any;
      setVehicleIntervalo(d?.intervalo_revisao_km ? Number(d.intervalo_revisao_km) : null);
      setVehicleProximaRevisao(d?.proxima_revisao_km ? Number(d.proxima_revisao_km) : null);
    });
  }, [veiculoId]);

  // When user picks "revisão" type, ensure interval is defined
  useEffect(() => {
    if (tipoManutencao !== "revisao" || !veiculoId) return;
    if (vehicleIntervalo && vehicleIntervalo > 0) {
      // Pre-fill próxima manutenção (KM) using interval + current km
      const baseKm = Number(kmAtual) || vehicleProximaRevisao || 0;
      if (!proximaManutencaoKm && baseKm > 0) {
        setProximaManutencaoKm(String(baseKm + vehicleIntervalo));
      }
    } else {
      // Ask user to define the interval for this vehicle
      setRevisaoIntervaloInput("");
      setRevisaoDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoManutencao, vehicleIntervalo, veiculoId]);

  const handleSaveRevisaoIntervalo = async () => {
    const intervalo = Number(revisaoIntervaloInput);
    if (!intervalo || intervalo <= 0) return toast.error("Informe um intervalo válido");
    if (!veiculoId) return;
    const { error } = await supabase.from("vehicles").update({ intervalo_revisao_km: intervalo } as any).eq("id", veiculoId);
    if (error) { toast.error("Erro ao salvar intervalo: " + error.message); return; }
    setVehicleIntervalo(intervalo);
    const baseKm = Number(kmAtual) || vehicleProximaRevisao || 0;
    if (baseKm > 0) setProximaManutencaoKm(String(baseKm + intervalo));
    setRevisaoDialogOpen(false);
    toast.success("Intervalo de revisão salvo no veículo");
  };


  useEffect(() => {
    if (!open) { reset(); return; }
    if (!editId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("maintenances" as any).select("*").eq("id", editId).maybeSingle();
      const m = data as any;
      if (m) {
        setVeiculoId(m.veiculo_id);
        setKmAtual(String(m.odometro || ""));
        setTipoManutencao(m.tipo_manutencao);
        setDescricaoServico(m.descricao || "");
        setDataManutencao(m.data_manutencao);
        setFornecedor(m.fornecedor || "");
        setProximaManutencaoKm(m.proxima_manutencao_km ? String(m.proxima_manutencao_km) : "");
        setDataProximaManutencao(m.data_proxima_manutencao || "");
        setTotal(Number(m.custo_total) || 0);
      }
      setLoading(false);
    })();
  }, [open, editId]);

  const handleSave = async () => {
    if (!veiculoId) return toast.error("Selecione o veículo");
    if (!kmAtual) return toast.error("Informe o KM atual");
    if (!descricaoServico.trim() && itensManutencao.length === 0) {
      return toast.error("Informe a descrição ou adicione itens");
    }

    const custoTotal = total > 0 ? total : itensManutencao.reduce((s, i) => s + i.valor_total, 0);
    if (custoTotal <= 0 && itensManutencao.length === 0) {
      // allow zero-cost manual records but warn
    }

    setSaving(true);
    try {
      let expenseId: string | null = null;

      // Optionally create expense first
      if (gerarDespesa && !editId) {
        const { data: estab } = await supabase
          .from("fiscal_establishments")
          .select("id")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        const { data: plano } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .ilike("nome", "%manuten%")
          .limit(1)
          .maybeSingle();

        if (!estab) throw new Error("Nenhum estabelecimento cadastrado.");
        if (!plano) throw new Error('Plano de contas "Manutenção" não encontrado.');

        const partsDesc = itensManutencao.length > 0
          ? itensManutencao.map(i => i.descricao).join(", ")
          : descricaoServico.trim();

        const { data: exp, error: expErr } = await supabase
          .from("expenses")
          .insert({
            empresa_id: estab.id,
            descricao: partsDesc || "Manutenção",
            tipo_despesa: "manutencao",
            plano_contas_id: plano.id,
            centro_custo: "operacional",
            valor_total: custoTotal,
            data_emissao: dataManutencao,
            data_vencimento: dataVencimento || dataManutencao,
            data_competencia: dataManutencao,
            status: "pendente",
            favorecido_nome: fornecedor.trim() || null,
            veiculo_id: veiculoId,
            tipo_manutencao: tipoManutencao,
            km_atual: Number(kmAtual) || null,
            fornecedor_mecanica: fornecedor.trim() || null,
            origem: "manual",
            created_by: user?.id,
          })
          .select("id")
          .single();
        if (expErr) throw expErr;
        expenseId = exp.id;

        if (itensManutencao.length > 0) {
          await supabase.from("expense_maintenance_items" as any).insert(itensManutencao.map(i => ({
            expense_id: expenseId,
            tipo: "peca",
            descricao: i.descricao,
            quantidade: i.quantidade,
            valor_unitario: i.valor_unitario,
            valor_total: i.valor_total,
          })));
        }
      }

      const maintenancePayload: any = {
        veiculo_id: veiculoId,
        expense_id: expenseId,
        data_manutencao: dataManutencao,
        odometro: Number(kmAtual) || 0,
        tipo_manutencao: tipoManutencao,
        descricao: descricaoServico.trim() || (itensManutencao.map(i => i.descricao).join(", ")),
        custo_total: custoTotal,
        fornecedor: fornecedor.trim() || null,
        status: "realizada",
        proxima_manutencao_km: proximaManutencaoKm ? Number(proximaManutencaoKm) : null,
        data_proxima_manutencao: dataProximaManutencao || null,
        created_by: user?.id,
      };

      if (editId) {
        const { error } = await supabase.from("maintenances" as any).update(maintenancePayload).eq("id", editId);
        if (error) throw error;
        toast.success("Manutenção atualizada");
      } else {
        const { error } = await supabase.from("maintenances" as any).insert(maintenancePayload);
        if (error) throw error;
        toast.success(gerarDespesa ? "Manutenção e conta a pagar criadas" : "Manutenção registrada");
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao salvar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" /> {editId ? "Editar Manutenção" : "Nova Manutenção"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Data da Manutenção *</Label>
                <Input type="date" value={dataManutencao} onChange={e => setDataManutencao(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Fornecedor / Oficina</Label>
                <Input
                  value={fornecedor}
                  onChange={e => setFornecedor(maskName(e.target.value))}
                  placeholder="Nome do prestador"
                  className="h-9"
                />
              </div>
            </div>

            <MaintenanceFields
              veiculoId={veiculoId}
              onVeiculoIdChange={setVeiculoId}
              kmAtual={kmAtual}
              onKmAtualChange={setKmAtual}
              tipoManutencao={tipoManutencao}
              onTipoManutencaoChange={setTipoManutencao}
              descricaoServico={descricaoServico}
              onDescricaoServicoChange={setDescricaoServico}
              tipoServico={tipoServico}
              onTipoServicoChange={setTipoServico}
              tempoParado={tempoParado}
              onTempoParadoChange={setTempoParado}
              proximaManutencaoKm={proximaManutencaoKm}
              onProximaManutencaoKmChange={setProximaManutencaoKm}
              dataProximaManutencao={dataProximaManutencao}
              onDataProximaManutencaoChange={setDataProximaManutencao}
              itensManutencao={itensManutencao}
              onItensManutencaoChange={setItensManutencao}
              onTotalChange={setTotal}
              hasNfse={false}
            />

            {!editId && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Gerar Conta a Pagar</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Cria automaticamente uma despesa no Financeiro vinculada a esta manutenção.
                    </p>
                  </div>
                  <Switch checked={gerarDespesa} onCheckedChange={setGerarDespesa} />
                </div>
                {gerarDespesa && (
                  <div>
                    <Label className="text-xs">Vencimento</Label>
                    <Input
                      type="date"
                      value={dataVencimento}
                      onChange={e => setDataVencimento(e.target.value)}
                      className="h-9"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Se em branco, usa a data da manutenção.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between bg-muted/40 rounded-md p-2.5">
              <span className="text-xs text-muted-foreground">Custo Total</span>
              <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Salvando...</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
