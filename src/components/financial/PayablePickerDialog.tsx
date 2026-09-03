import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { EmpresaFilter } from "./EmpresaControls";
import { cn } from "@/lib/utils";

export interface PayableOption {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_vencimento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  empresa_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payables: PayableOption[];
  loading?: boolean;
  onSelect: (option: PayableOption) => void;
}

const statusLabel: Record<string, string> = { pendente: "Pendente", pago: "Pago", atrasado: "Vencido", parcial: "Parcial" };

export function PayablePickerDialog({ open, onOpenChange, payables, loading, onSelect }: Props) {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("abertas");
  const [empresa, setEmpresa] = useState("");
  const [vencidas, setVencidas] = useState("todas");

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setStatus("abertas");
    setEmpresa("");
    setVencidas("todas");
  }, [open]);

  const filtered = useMemo(() => {
    const today = getLocalDateISO();
    const t = term.trim().toLowerCase();
    return payables
      .filter((p) => {
        const balance = Math.max(0, Number(p.valor_total) - Number(p.valor_pago || 0));
        if (status === "abertas" && (p.status === "pago" || balance <= 0)) return false;
        if (status !== "abertas" && status !== "todas" && p.status !== status) return false;
        if (empresa && p.empresa_id !== empresa) return false;
        if (vencidas === "vencidas" && !(p.data_vencimento && p.data_vencimento < today && balance > 0)) return false;
        if (vencidas === "a_vencer" && !(p.data_vencimento && p.data_vencimento >= today)) return false;
        if (!t) return true;
        return [p.descricao, p.favorecido_nome].some((v) => String(v || "").toLowerCase().includes(t));
      })
      .sort((a, b) => String(a.data_vencimento || "9999").localeCompare(String(b.data_vencimento || "9999")))
      .slice(0, 300);
  }, [payables, term, status, empresa, vencidas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Selecionar conta a pagar</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 w-[220px] pl-7 text-xs"
              placeholder="Buscar descrição ou favorecido..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertas" className="text-xs">Em aberto</SelectItem>
              <SelectItem value="pendente" className="text-xs">Pendentes</SelectItem>
              <SelectItem value="parcial" className="text-xs">Parciais</SelectItem>
              <SelectItem value="atrasado" className="text-xs">Vencidas</SelectItem>
              <SelectItem value="todas" className="text-xs">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vencidas} onValueChange={setVencidas}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas" className="text-xs">Todos vencimentos</SelectItem>
              <SelectItem value="vencidas" className="text-xs">Somente vencidas</SelectItem>
              <SelectItem value="a_vencer" className="text-xs">A vencer</SelectItem>
            </SelectContent>
          </Select>
          <EmpresaFilter value={empresa} onChange={setEmpresa} />
        </div>

        <div className="border rounded max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="text-[11px]">Descrição</TableHead>
                <TableHead className="text-[11px]">Favorecido</TableHead>
                <TableHead className="text-[11px] w-[95px]">Vencimento</TableHead>
                <TableHead className="text-[11px] w-[80px]">Situação</TableHead>
                <TableHead className="text-[11px] w-[105px] text-right">Saldo</TableHead>
                <TableHead className="text-[11px] w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="py-4 text-center text-xs text-muted-foreground">Carregando contas...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-4 text-center text-xs text-muted-foreground">Nenhuma conta encontrada para os filtros.</TableCell></TableRow>
              )}
              {!loading && filtered.map((p) => {
                const balance = Math.max(0, Number(p.valor_total) - Number(p.valor_pago || 0));
                const overdue = p.data_vencimento && p.data_vencimento < getLocalDateISO() && balance > 0;
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => { onSelect(p); onOpenChange(false); }}
                  >
                    <TableCell className="max-w-[240px] truncate text-[11px]" title={p.descricao}>{p.descricao || "—"}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-[11px]">{p.favorecido_nome || "—"}</TableCell>
                    <TableCell className={cn("text-[11px] whitespace-nowrap", overdue && "text-destructive font-medium")}>
                      {p.data_vencimento ? formatDateBR(p.data_vencimento) : "—"}
                    </TableCell>
                    <TableCell className="text-[11px]">{statusLabel[p.status] || p.status}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] font-medium">{formatCurrency(balance)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> Incluir
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-[10px] text-muted-foreground">{filtered.length} conta(s) encontrada(s). Clique na linha ou em "Incluir" para vincular ao cheque.</p>
      </DialogContent>
    </Dialog>
  );
}
