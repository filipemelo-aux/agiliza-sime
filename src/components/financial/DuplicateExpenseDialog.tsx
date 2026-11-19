import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { fetchExpenseDetail, buildExpenseDetailHtml } from "@/lib/expenseDetail";
import { toast } from "@/lib/notice";
import type { DuplicateMatch } from "@/lib/expenseDuplicates";

const STATUS: Record<string, string> = { pendente: "Pendente", pago: "Pago", atrasado: "Atrasado", parcial: "Parcial" };

interface Props {
  matches: DuplicateMatch[] | null;
  onContinue: () => void;
  onCancel: () => void;
}

export function DuplicateExpenseDialog({ matches, onContinue, onCancel }: Props) {
  const [detailHtml, setDetailHtml] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openDetail = async (id: string) => {
    setLoadingId(id);
    try { setDetailHtml(buildExpenseDetailHtml(await fetchExpenseDetail(id))); }
    catch (e: any) { toast.error(e?.message || "Não foi possível abrir a despesa"); }
    finally { setLoadingId(null); }
  };

  return (
    <>
      <Dialog open={!!matches && !detailHtml} onOpenChange={(o) => { if (!o) onCancel(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Possível despesa duplicada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Já existe despesa parecida para este fornecedor. Abra o detalhe para conferir antes de continuar.
          </p>
          <div className="space-y-2">
            {matches?.map(({ expense: e, reason }) => (
              <div key={e.id} className="flex items-center gap-3 rounded-md border p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{e.favorecido_nome || "—"} {e.documento_fiscal_numero ? `· Doc. ${e.documento_fiscal_numero}` : ""}</div>
                  <div className="text-muted-foreground truncate">{e.descricao}</div>
                  <div className="text-muted-foreground">
                    {formatCurrency(Number(e.valor_total || 0))} · Emissão {e.data_emissao ? formatDateBR(e.data_emissao) : "—"} · Venc. {e.data_vencimento ? formatDateBR(e.data_vencimento) : "—"} · {STATUS[e.status || ""] || e.status}
                  </div>
                  <div className="text-warning font-medium">{reason === "documento" ? "Mesmo fornecedor e mesmo nº de documento" : "Mesmo fornecedor, valor e vencimento"}</div>
                </div>
                <Button variant="outline" size="sm" disabled={loadingId === e.id} onClick={() => openDetail(e.id)}>
                  <Eye className="h-4 w-4 mr-1" /> {loadingId === e.id ? "Abrindo…" : "Ver detalhe"}
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel}>Voltar sem salvar</Button>
            <Button onClick={onContinue}>Não é duplicada, salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detailHtml} onOpenChange={(o) => { if (!o) setDetailHtml(null); }}>
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader><DialogTitle>Detalhe da despesa existente</DialogTitle></DialogHeader>
          {detailHtml && <iframe title="Detalhe da despesa" srcDoc={detailHtml} className="w-full h-[65vh] rounded border bg-background" />}
          <div className="flex justify-end"><Button onClick={() => setDetailHtml(null)}>Fechar e voltar</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
