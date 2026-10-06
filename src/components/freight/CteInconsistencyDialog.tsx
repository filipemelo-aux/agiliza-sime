import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { formatDateBR } from "@/lib/date";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void;
  /** Quando informado, mostra apenas duplicidades que envolvem estes CT-es. */
  focusIds?: string[];
}

const brDate = (v: string) => {
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
};

interface CteRow {
  id: string;
  numero: number | null;
  numero_interno: number | null;
  data_emissao: string | null;
  placa_veiculo: string | null;
  peso_bruto: number | null;
  remetente_nome: string | null;
  destinatario_nome: string | null;
  valor_frete: number | null;
  status: string;
  tipo_talao: string | null;
}

interface DupGroup {
  key: string;
  data: string;
  placa: string;
  peso: number;
  valor: number;
  items: CteRow[];
}

export function CteInconsistencyDialog({ open, onOpenChange, onDeleted, focusIds }: Props) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [contractsByCte, setContractsByCte] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) scan();
    else {
      setGroups([]);
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ctes")
        .select("id, numero, numero_interno, data_emissao, placa_veiculo, peso_bruto, remetente_nome, destinatario_nome, valor_frete, status, tipo_talao")
        .not("data_emissao", "is", null)
        .not("placa_veiculo", "is", null)
        .not("peso_bruto", "is", null)
        .gt("peso_bruto", 0)
        .order("data_emissao", { ascending: false })
        .limit(20000);
      if (error) throw error;

      const map = new Map<string, DupGroup>();
      for (const row of (data as CteRow[]) || []) {
        const dataKey = brDate(String(row.data_emissao));
        const placa = String(row.placa_veiculo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const peso = Math.round(Number(row.peso_bruto || 0));
        const valor = Number(row.valor_frete || 0);
        if (!dataKey || !placa || !peso || peso <= 0) continue;
        const key = `${dataKey}|${placa}|${peso}|${valor.toFixed(2)}`;
        if (!map.has(key)) {
          map.set(key, { key, data: dataKey, placa, peso, valor, items: [] });
        }
        map.get(key)!.items.push(row);
      }
      const focus = focusIds?.length ? new Set(focusIds) : null;
      const dups = Array.from(map.values()).filter((g) =>
        g.items.length > 1 && (!focus || g.items.some((i) => focus.has(i.id))),
      );
      setGroups(dups);
      const allIds = dups.flatMap((g) => g.items.map((i) => i.id));
      const cmap: Record<string, number> = {};
      for (let k = 0; k < allIds.length; k += 200) {
        const { data: cs } = await supabase
          .from("freight_contracts")
          .select("cte_id, numero")
          .in("cte_id", allIds.slice(k, k + 200));
        for (const c of cs || []) cmap[c.cte_id] = c.numero;
      }
      setContractsByCte(cmap);
      // Pré-marca os registros antigos (não selecionados) para exclusão
      setSelected(focus ? new Set(dups.flatMap((g) => g.items.filter((i) => !focus.has(i.id)).map((i) => i.id))) : new Set());
    } catch (err: any) {
      toast({ title: "Erro ao verificar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: "Excluir CT-es duplicados",
      description: `Confirma excluir ${selected.size} CT-e(s)?\n\nContratos de frete dos CT-es excluídos serão transferidos para o CT-e mantido do mesmo grupo (preferindo o importado). Se não houver CT-e mantido sem contrato, o contrato será excluído.\n\nEsta ação é irreversível.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    const ids = Array.from(selected);
    let okCount = 0;
    const errors: string[] = [];

    try {
      // Contratos vinculados aos CT-es que serão excluídos
      const { data: contracts } = await supabase
        .from("freight_contracts")
        .select("id, expense_id, cte_id")
        .in("cte_id", ids);

      const focus = new Set(focusIds || []);
      const taken = new Set(Object.keys(contractsByCte));
      const toDelete: any[] = [];
      let moved = 0;

      for (const c of contracts || []) {
        const group = groups.find((g) => g.items.some((i) => i.id === c.cte_id));
        const candidates = (group?.items || []).filter((i) => !selected.has(i.id) && !taken.has(i.id));
        const target = candidates.find((i) => focus.has(i.id)) || candidates[0];
        if (target) {
          const { error } = await supabase.from("freight_contracts").update({ cte_id: target.id }).eq("id", c.id);
          if (error) { errors.push(`Contrato: ${error.message}`); toDelete.push(c); }
          else { taken.add(target.id); moved++; }
        } else {
          toDelete.push(c);
        }
      }

      const contractIds = toDelete.map((c) => c.id);
      const expenseIds = toDelete.map((c) => c.expense_id).filter(Boolean);

      if (contractIds.length) {
        const { error } = await supabase.from("freight_contracts").delete().in("id", contractIds);
        if (error) errors.push(`Contratos: ${error.message}`);
      }

      if (expenseIds.length) {
        await supabase.from("expenses").delete().in("id", expenseIds).in("status", ["pendente", "atrasado"]);
      }

      // Deletar CT-es (trigger remove previsoes)
      for (const id of ids) {
        const { error } = await supabase.from("ctes").delete().eq("id", id);
        if (error) errors.push(`CT-e ${id.slice(0, 8)}: ${error.message}`);
        else okCount++;
      }

      toast({
        title: errors.length ? "Concluído com erros" : "Duplicidades removidas",
        description: `${okCount} CT-e(s) excluído(s).${moved ? ` ${moved} contrato(s) de frete transferido(s) para o CT-e importado.` : ""}${errors.length ? "\n" + errors.slice(0, 3).join("\n") : ""}`,
        variant: errors.length ? "destructive" : "default",
      });
      onDeleted?.();
      await scan();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[800px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Verificação de Inconsistências
            </DialogTitle>
            <DialogDescription>
              Procura CT-es com mesma <strong>data de emissão + placa + peso + valor</strong>. CT-es com peso zero são ignorados.{focusIds?.length ? ` Analisando ${focusIds.length} CT-e(s) selecionado(s) contra todos os talões; os registros não selecionados vêm marcados para exclusão.` : ""}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Analisando…</span>
            </div>
          ) : groups.length === 0 ? (
            <Alert>
              <AlertDescription className="text-xs">
                Nenhuma duplicidade encontrada. Tudo certo!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {groups.length} grupo(s) de duplicidade encontrado(s). Marque os CT-es que deseja excluir.
                </AlertDescription>
              </Alert>
              {groups.map((g) => (
                <div key={g.key} className="border border-border rounded-md p-2 bg-muted/20">
                  <div className="text-xs font-medium mb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {formatDateBR(g.data)} · {g.placa} · {Number(g.peso).toLocaleString("pt-BR")} kg · {Number(g.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </Badge>
                    <span className="text-muted-foreground">({g.items.length} registros)</span>
                  </div>
                  <div className="space-y-1">
                    {g.items.map((item) => {
                      const num = item.numero ?? item.numero_interno ?? "—";
                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded bg-background border border-border/60 cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={() => toggle(item.id)}
                          />
                          <span className="text-[11px] font-mono w-14">Nº {num}</span>
                          <Badge variant="outline" className="text-[9px]">{item.tipo_talao === "servico" ? "Serviço" : "Produção"}</Badge>
                          <Badge variant="outline" className="text-[9px]">{item.status}</Badge>
                          {focusIds?.includes(item.id) && <Badge className="text-[9px]">Selecionado</Badge>}
                          {contractsByCte[item.id] != null && <Badge variant="secondary" className="text-[9px]">Contrato Nº {contractsByCte[item.id]}</Badge>}
                          <span className="text-[11px] truncate flex-1">
                            {item.destinatario_nome || item.remetente_nome || "—"}
                          </span>
                          <span className="text-[11px] font-mono">
                            {Number(item.valor_frete || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={scan} disabled={loading || deleting}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reanalisar"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={deleting}>
                Fechar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selected.size === 0 || deleting}
                onClick={handleDeleteSelected}
                className="gap-2"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Excluir selecionados ({selected.size})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </>
  );
}
