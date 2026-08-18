import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { searchOpenPayables, type OpenPayableOption } from "@/services/creditCardPayableLink";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valor do lançamento do cartão — usado para sugerir contas com valor equivalente. */
  amount: number;
  /** Data do lançamento — usada para ordenar sugestões por proximidade de vencimento. */
  postedDate?: string;
  description?: string;
  onSelect: (option: OpenPayableOption) => void;
}

const TOLERANCIA = 1; // R$ 1,00

export function LinkPayableDialog({ open, onOpenChange, amount, postedDate, description, onSelect }: Props) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<OpenPayableOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    void load("");
  }, [open]);

  const load = async (t: string) => {
    setLoading(true);
    try {
      setRows(await searchOpenPayables(t, 60));
    } catch (e: any) {
      toast.error(e.message || "Erro ao buscar contas a pagar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => void load(term), 350);
    return () => clearTimeout(h);
  }, [term, open]);

  const ordered = useMemo(() => {
    const target = Number(amount || 0);
    const ref = postedDate ? new Date(`${postedDate}T12:00:00`).getTime() : 0;
    return [...rows].sort((a, b) => {
      const da = Math.abs(a.valor_aberto - target);
      const db = Math.abs(b.valor_aberto - target);
      const ma = da <= TOLERANCIA ? 0 : 1;
      const mb = db <= TOLERANCIA ? 0 : 1;
      if (ma !== mb) return ma - mb;
      if (ma === 0 && da !== db) return da - db;
      if (!ref) return da - db;
      const va = a.data_vencimento ? Math.abs(new Date(`${a.data_vencimento}T12:00:00`).getTime() - ref) : Infinity;
      const vb = b.data_vencimento ? Math.abs(new Date(`${b.data_vencimento}T12:00:00`).getTime() - ref) : Infinity;
      return va - vb;
    });
  }, [rows, amount, postedDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Vincular a uma conta a pagar</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            Lançamento do cartão: <strong>{description || "—"}</strong> · {postedDate ? formatDateBR(postedDate) : "—"} ·{" "}
            <strong className="text-primary">{formatCurrency(amount)}</strong>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Ao vincular, a conta será quitada sem gerar movimentação de caixa — a obrigação fica na fatura do cartão.
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-9 pl-7 text-xs"
              placeholder="Buscar por descrição ou favorecido..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          <div className="border rounded max-h-[380px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-[11px]">Descrição</TableHead>
                  <TableHead className="text-[11px]">Favorecido</TableHead>
                  <TableHead className="text-[11px]">Parcela</TableHead>
                  <TableHead className="text-[11px]">Vencimento</TableHead>
                  <TableHead className="text-[11px] text-right">Em aberto</TableHead>
                  <TableHead className="text-[11px] w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground py-4 text-center">Buscando...</TableCell></TableRow>
                )}
                {!loading && ordered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground py-4 text-center">Nenhuma conta em aberto encontrada.</TableCell></TableRow>
                )}
                {!loading && ordered.map((o) => {
                  const match = Math.abs(o.valor_aberto - Number(amount || 0)) <= TOLERANCIA;
                  return (
                    <TableRow
                      key={`${o.expense_id}-${o.installment_id || "u"}`}
                      className={cn("cursor-pointer", match && "bg-success/10")}
                      onClick={() => { onSelect(o); onOpenChange(false); }}
                    >
                      <TableCell className="text-[11px] max-w-[240px] truncate" title={o.descricao}>{o.descricao}</TableCell>
                      <TableCell className="text-[11px] max-w-[150px] truncate">{o.favorecido_nome || "—"}</TableCell>
                      <TableCell className="text-[11px]">{o.parcela_label || "—"}</TableCell>
                      <TableCell className="text-[11px]">{o.data_vencimento ? formatDateBR(o.data_vencimento) : "—"}</TableCell>
                      <TableCell className="text-[11px] text-right font-mono">{formatCurrency(o.valor_aberto)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                          <Link2 className="h-3 w-3" /> Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
