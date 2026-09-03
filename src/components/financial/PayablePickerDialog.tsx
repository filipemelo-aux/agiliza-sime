import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { EmpresaFilter } from "./EmpresaControls";
import { cn } from "@/lib/utils";

export interface PayableOption {
  /** Chave única da linha (id da parcela quando parcelado) */
  id: string;
  /** Conta a pagar de origem */
  expense_id: string;
  /** Ex.: "2/6" — nulo quando a conta não é parcelada */
  parcela_label?: string | null;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_vencimento: string | null;
  data_emissao: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  empresa_id: string;
  forma_pagamento: string | null;
  plano_contas_id?: string | null;
  plano_contas_nome: string | null;
  veiculo_placa: string | null;
  fornecedor_cnpj: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payables: PayableOption[];
  loading?: boolean;
  /** Contas já vinculadas ao cheque */
  selectedIds?: string[];
  /** Confirmação da seleção múltipla */
  onConfirm: (options: PayableOption[]) => void;
}

const statusLabel: Record<string, string> = { pendente: "Pendente", pago: "Pago", atrasado: "Vencido", parcial: "Parcial" };

const formaPagamentoLabel: Record<string, string> = {
  cheque: "Cheque",
  pix: "Pix",
  transferencia: "Transf.",
  transferência: "Transf.",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  cartão: "Cartão",
  boleto: "Boleto",
  debito: "Déb.",
  débito: "Déb.",
  credito: "Créd.",
  crédito: "Créd.",
};

function formaLabel(v: string | null): string {
  if (!v) return "—";
  const key = v.trim().toLowerCase();
  return formaPagamentoLabel[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function daysOverdue(vencimento: string | null, balance: number): number {
  if (!vencimento || balance <= 0) return 0;
  const today = getLocalDateISO();
  const v = new Date(vencimento + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  const diff = Math.floor((t.getTime() - v.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

export function PayablePickerDialog({ open, onOpenChange, payables, loading, selectedIds, onConfirm }: Props) {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("abertas");
  const [empresa, setEmpresa] = useState("");
  const [vencidas, setVencidas] = useState("todas");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setStatus("abertas");
    setEmpresa("");
    setVencidas("todas");
    setPicked(selectedIds ?? []);
  }, [open]);

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const pickedRows = useMemo(() => payables.filter((p) => picked.includes(p.id)), [payables, picked]);
  const pickedTotal = pickedRows.reduce((sum, p) => sum + Math.max(0, Number(p.valor_total) - Number(p.valor_pago || 0)), 0);

  const confirm = () => {
    onConfirm(pickedRows);
    onOpenChange(false);
  };

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
        return [p.descricao, p.favorecido_nome, p.plano_contas_nome, p.veiculo_placa, p.fornecedor_cnpj].some((v) => String(v || "").toLowerCase().includes(t));
      })
      .sort((a, b) => String(a.data_vencimento || "9999").localeCompare(String(b.data_vencimento || "9999")))
      .slice(0, 300);
  }, [payables, term, status, empresa, vencidas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-base">Selecionar conta a pagar</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 w-[260px] pl-7 text-xs"
              placeholder="Buscar descrição, favorecido, plano, placa, CNPJ..."
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

        <div className="border rounded max-h-[460px] overflow-y-auto">
          <Table className="text-[10px]">
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow className="h-7">
                <TableHead className="text-[10px] py-1 px-2 w-[32px]">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((p) => picked.includes(p.id))}
                    onCheckedChange={(checked) => {
                      const ids = filtered.map((p) => p.id);
                      setPicked((prev) => (checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id))));
                    }}
                    aria-label="Selecionar todas"
                  />
                </TableHead>
                <TableHead className="text-[10px] py-1 px-2">Descrição / Favorecido</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[56px]">Parcela</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[150px]">Plano de contas</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[64px]">Forma</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[72px]">Vencimento</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[70px]">Situação</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[90px] text-right">Em aberto</TableHead>
                <TableHead className="text-[10px] py-1 px-2 w-[44px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={11} className="py-4 text-center text-xs text-muted-foreground">Carregando contas...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="py-4 text-center text-xs text-muted-foreground">Nenhuma conta encontrada para os filtros.</TableCell></TableRow>
              )}
              {!loading && filtered.map((p) => {
                const total = Number(p.valor_total) || 0;
                const pago = Number(p.valor_pago) || 0;
                const balance = Math.max(0, total - pago);
                const overdueDays = daysOverdue(p.data_vencimento, balance);
                const isPicked = picked.includes(p.id);
                return (
                  <TableRow
                    key={p.id}
                    className={cn("cursor-pointer h-7 hover:bg-muted/40", isPicked && "bg-primary/5")}
                    onClick={() => toggle(p.id)}
                  >
                    <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isPicked} onCheckedChange={() => toggle(p.id)} aria-label="Selecionar conta" />
                    </TableCell>
                    <TableCell className="py-1 px-2 max-w-[260px]">
                      <div className="truncate font-medium text-[11px]" title={p.descricao}>{p.descricao || "—"}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="truncate max-w-[150px]" title={p.favorecido_nome ?? undefined}>{p.favorecido_nome || "Sem favorecido"}</span>
                        {p.fornecedor_cnpj && <span className="shrink-0">· {p.fornecedor_cnpj}</span>}
                        {p.veiculo_placa && <span className="shrink-0 font-mono">· {p.veiculo_placa}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-1 px-2 text-[10px] whitespace-nowrap font-mono">{p.parcela_label || "única"}</TableCell>
                    <TableCell className="py-1 px-2 text-[10px] truncate max-w-[150px]" title={p.plano_contas_nome ?? undefined}>{p.plano_contas_nome || "—"}</TableCell>
                    <TableCell className="py-1 px-2 text-[10px] whitespace-nowrap">{formaLabel(p.forma_pagamento)}</TableCell>
                    <TableCell className={cn("py-1 px-2 text-[10px] whitespace-nowrap", overdueDays > 0 && "text-destructive font-medium")}>
                      <div>{p.data_vencimento ? formatDateBR(p.data_vencimento) : "—"}</div>
                      {overdueDays > 0 && <div className="text-[9px] leading-none">há {overdueDays}d</div>}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-[10px] whitespace-nowrap">{statusLabel[p.status] || p.status}</TableCell>
                    <TableCell className="py-1 px-2 text-right font-mono text-[10px] whitespace-nowrap">{formatCurrency(total)}</TableCell>
                    <TableCell className="py-1 px-2 text-right font-mono text-[10px] whitespace-nowrap text-muted-foreground">{pago > 0 ? formatCurrency(pago) : "—"}</TableCell>
                    <TableCell className="py-1 px-2 text-right font-mono text-[10px] font-semibold whitespace-nowrap">{formatCurrency(balance)}</TableCell>
                    <TableCell className="py-1 px-2">
                      <Button
                        size="sm"
                        variant={isPicked ? "default" : "outline"}
                        className="h-6 gap-1 px-1.5 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
                      >
                        <CheckCircle2 className="h-3 w-3" /> {isPicked ? "Incluída" : "Incluir"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {filtered.length} conta(s) encontrada(s) · <strong className="text-foreground">{pickedRows.length}</strong> selecionada(s) — saldo total {formatCurrency(pickedTotal)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPicked([])} disabled={picked.length === 0}>Limpar</Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={confirm} disabled={pickedRows.length === 0}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Incluir {pickedRows.length || ""} conta(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
