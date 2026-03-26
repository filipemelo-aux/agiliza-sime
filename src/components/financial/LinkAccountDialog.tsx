import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Link2, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { format } from "date-fns";

interface LinkAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
}

interface UnlinkedItem {
  id: string;
  description: string;
  amount: number;
  due_date: string | null;
  status: string;
  person_name: string | null;
  type: "receivable" | "payable";
}

export function LinkAccountDialog({ open, onOpenChange, accountId, accountName }: LinkAccountDialogProps) {
  const [items, setItems] = useState<UnlinkedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "receivable" | "payable">("all");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const [recRes, payRes] = await Promise.all([
      supabase
        .from("accounts_receivable")
        .select("id, description, amount, due_date, status, debtor_name, conta_bancaria_id")
        .is("conta_bancaria_id", null)
        .order("due_date", { ascending: true }),
      supabase
        .from("expenses")
        .select("id, descricao, valor_total, data_vencimento, status, favorecido_nome, conta_bancaria_id")
        .is("conta_bancaria_id", null)
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true }),
    ]);

    const receivables: UnlinkedItem[] = (recRes.data ?? []).map((r: any) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      due_date: r.due_date,
      status: r.status,
      person_name: r.debtor_name,
      type: "receivable" as const,
    }));

    const payables: UnlinkedItem[] = (payRes.data ?? []).map((p: any) => ({
      id: p.id,
      description: p.descricao,
      amount: p.valor_total,
      due_date: p.data_vencimento,
      status: p.status,
      person_name: p.favorecido_nome,
      type: "payable" as const,
    }));

    setItems([...receivables, ...payables]);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchItems();
      setSearch("");
      setTab("all");
    }
  }, [open, fetchItems]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visible = filtered.map(i => i.id);
    const allSelected = visible.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) visible.forEach(id => next.delete(id));
      else visible.forEach(id => next.add(id));
      return next;
    });
  };

  const handleLink = async () => {
    if (selected.size === 0) { toast.error("Selecione ao menos um item"); return; }
    setSaving(true);

    const receivableIds = items.filter(i => selected.has(i.id) && i.type === "receivable").map(i => i.id);
    const payableIds = items.filter(i => selected.has(i.id) && i.type === "payable").map(i => i.id);

    const promises: PromiseLike<any>[] = [];

    if (receivableIds.length > 0) {
      promises.push(
        supabase
          .from("accounts_receivable")
          .update({ conta_bancaria_id: accountId } as any)
          .in("id", receivableIds)
          .then()
      );
    }

    if (payableIds.length > 0) {
      promises.push(
        supabase
          .from("expenses")
          .update({ conta_bancaria_id: accountId } as any)
          .in("id", payableIds)
          .then()
      );
    }

    const results = await Promise.all(promises);
    const hasError = results.some(r => r.error);

    if (hasError) {
      toast.error("Erro ao vincular alguns itens");
    } else {
      toast.success(`${selected.size} item(ns) vinculado(s) à conta "${accountName}"`);
      onOpenChange(false);
    }
    setSaving(false);
  };

  const filtered = items.filter(i => {
    if (tab !== "all" && i.type !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        i.description.toLowerCase().includes(s) ||
        (i.person_name ?? "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  const selectedCount = selected.size;
  const recCount = items.filter(i => i.type === "receivable").length;
  const payCount = items.filter(i => i.type === "payable").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular à {accountName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="all">Todos ({items.length})</TabsTrigger>
            <TabsTrigger value="receivable">
              <ArrowDownCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              Receber ({recCount})
            </TabsTrigger>
            <TabsTrigger value="payable">
              <ArrowUpCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
              Pagar ({payCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum lançamento pendente sem conta bancária vinculada.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">Selecionar todos ({filtered.length})</span>
              </div>
              {selectedCount > 0 && (
                <Badge variant="secondary" className="text-xs">{selectedCount} selecionado(s)</Badge>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[40vh] pr-1">
              {filtered.map(item => (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-colors border-l-4 ${
                    item.type === "receivable" ? "border-l-emerald-500" : "border-l-destructive"
                  } ${selected.has(item.id) ? "bg-accent/50" : ""}`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <CardContent className="p-2.5 flex items-start gap-2">
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.description}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            item.type === "receivable" ? "text-emerald-600 border-emerald-300" : "text-destructive border-destructive/30"
                          }`}
                        >
                          {item.type === "receivable" ? "Receber" : "Pagar"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {item.person_name && <span className="truncate">{item.person_name}</span>}
                        {item.due_date && (
                          <span>Venc: {format(new Date(item.due_date + "T00:00:00"), "dd/MM/yy")}</span>
                        )}
                        <span className="font-mono font-medium text-foreground ml-auto shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleLink} disabled={saving || selectedCount === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
            Vincular {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
