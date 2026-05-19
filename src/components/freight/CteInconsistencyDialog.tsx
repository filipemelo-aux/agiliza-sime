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
}

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
  items: CteRow[];
}

export function CteInconsistencyDialog({ open, onOpenChange, onDeleted }: Props) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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
        .limit(5000);
      if (error) throw error;

      const map = new Map<string, DupGroup>();
      for (const row of (data as CteRow[]) || []) {
        const dataKey = String(row.data_emissao).slice(0, 10);
        const placa = String(row.placa_veiculo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const peso = Number(row.peso_bruto || 0);
        if (!dataKey || !placa || !peso) continue;
        const key = `${dataKey}|${placa}|${peso}`;
        if (!map.has(key)) {
          map.set(key, { key, data: dataKey, placa, peso, items: [] });
        }
        map.get(key)!.items.push(row);
      }
      const dups = Array.from(map.values()).filter((g) => g.items.length > 1);
      setGroups(dups);
      setSelected(new Set());
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
      description: `Confirma excluir ${selected.size} CT-e(s) e seus contratos de frete vinculados?\n\nEsta ação é irreversível.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    const ids = Array.from(selected);
    let okCount = 0;
    const errors: string[] = [];

    try {
      // Buscar contratos vinculados
      const { data: contracts } = await supabase
        .from("freight_contracts")
        .select("id, accounts_payable_id, cte_id")
        .in("cte_id", ids);

      const expenseIds = (contracts || []).map((c: any) => c.accounts_payable_id).filter(Boolean);
      const contractIds = (contracts || []).map((c: any) => c.id);

      // Deletar contratos
      if (contractIds.length) {
        const { error } = await supabase.from("freight_contracts").delete().in("id", contractIds);
        if (error) errors.push(`Contratos: ${error.message}`);
      }

      // Deletar contas a pagar pendentes vinculadas
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
        description: `${okCount} CT-e(s) excluído(s).${errors.length ? "\n" + errors.slice(0, 3).join("\n") : ""}`,
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
              Procura CT-es com mesma <strong>data de emissão + placa + peso</strong>.
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
                      {formatDateBR(g.data)} · {g.placa} · {Number(g.peso).toLocaleString("pt-BR")} kg
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
