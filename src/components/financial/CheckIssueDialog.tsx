import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";
import { valorPorExtenso } from "@/lib/valorExtenso";
import { buildCheckPdf, downloadPdfBytes } from "@/lib/checkPdf";
import { CheckPdfPreview } from "@/components/financial/CheckPdfPreview";
import { Printer, AlertTriangle, Download, X } from "lucide-react";


export interface CheckIssueData {
  expenseId?: string | null;
  /** Múltiplas contas a pagar vinculadas ao mesmo cheque */
  expenseIds?: string[];
  freightContractId?: string | null;
  empresaId?: string | null;
  contaBancariaId?: string | null;
  vinculoTipo?: "conta_pagar" | "contrato_frete" | "movimentacao" | "avulso";
  planoContasId?: string | null;
  favorecidoId?: string | null;
  valor: number;
  nominal: string;
  data?: string | null;
  historico?: string | null;
  numeroCheque?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CheckIssueData;
  /** Called after the check number was persisted on the expense */
  onSaved?: (numeroCheque: string, info?: { predatado: boolean; dataVencimento: string | null }) => void;
}

type Layout = Record<string, any>;


export function CheckIssueDialog({ open, onOpenChange, data, onSaved }: Props) {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [layoutId, setLayoutId] = useState("");
  const [cidade, setCidade] = useState(localStorage.getItem("cheque_cidade") || "Araguaína");
  const [dataCheque, setDataCheque] = useState(data.data || getLocalDateISO());
  const [numeroCheque, setNumeroCheque] = useState(data.numeroCheque || "");
  const [generating, setGenerating] = useState(false);
  const [cruzado, setCruzado] = useState(localStorage.getItem("cheque_cruzado") !== "0");
  const [imprimirCanhoto, setImprimirCanhoto] = useState(localStorage.getItem("cheque_canhoto") !== "0");
  const [predatado, setPredatado] = useState(false);
  const [dataVencimento, setDataVencimento] = useState(data.data || getLocalDateISO());
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!open) return;
    setDataCheque(data.data || getLocalDateISO());
    setNumeroCheque(data.numeroCheque || "");
    setPredatado(false);
    setDataVencimento(data.data || getLocalDateISO());
    setPdfBlobUrl(null);
    setPdfBytes(null);
    (async () => {
      const { data: rows } = await supabase
        .from("check_layouts")
        .select("*")
        .eq("ativo", true)
        .order("banco_nome");
      const list = (rows as any[]) || [];
      setLayouts(list);
      if (list.length && !layoutId) setLayoutId(list[0].id);
    })();
  }, [open]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const layout = useMemo(() => layouts.find(l => l.id === layoutId), [layouts, layoutId]);
  const extenso = useMemo(() => valorPorExtenso(data.valor), [data.valor]);

  const handleGerar = async () => {
    if (!layout) return toast.error("Selecione um template de cheque");
    if (!cidade.trim()) return toast.error("Informe a cidade");
    if (predatado && !dataVencimento) return toast.error("Informe a data do cheque pré-datado");
    setGenerating(true);
    try {
      const bytes = await buildCheckPdf({
        layout,
        valor: data.valor,
        nominal: data.nominal,
        historico: data.historico,
        cidade,
        dataISO: dataCheque,
        cruzado,
        imprimirCanhoto,
        predatado,
        dataVencimentoISO: predatado ? dataVencimento : null,
      });
      const blobUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
      setPdfBytes(bytes);
      setPdfBlobUrl(blobUrl);

      localStorage.setItem("cheque_cruzado", cruzado ? "1" : "0");
      localStorage.setItem("cheque_canhoto", imprimirCanhoto ? "1" : "0");

      const updates: Record<string, any> = {};
      if (numeroCheque.trim()) updates.numero_cheque = numeroCheque.trim();
      // Pré-datado: a data do cheque passa a ser o vencimento no contas a pagar
      if (predatado && dataVencimento) updates.data_vencimento = dataVencimento;

      const linkedExpenseIds = Array.from(
        new Set([...(data.expenseIds || []), ...(data.expenseId ? [data.expenseId] : [])].filter(Boolean) as string[]),
      );

      if (Object.keys(updates).length && linkedExpenseIds.length) {
        const { error } = await supabase
          .from("expenses")
          .update(updates as any)
          .in("id", linkedExpenseIds);
        if (error) toast.error("Cheque gerado, mas falhou ao salvar o número", { description: error.message });
      }

      const chequePayload = {
        empresa_id: data.empresaId || null,
        numero_cheque: numeroCheque.trim() || null,
        valor: Number(data.valor) || 0,
        favorecido_nome: data.nominal?.trim() || "",
        favorecido_id: data.favorecidoId || null,
        data_emissao: dataCheque,
        data_vencimento: predatado ? dataVencimento : null,
        predatado,
        cruzado,
        cidade: cidade.trim() || null,
        historico: data.historico?.trim() || null,
        vinculo_tipo: data.vinculoTipo || (linkedExpenseIds.length ? "conta_pagar" : "avulso"),
        expense_id: linkedExpenseIds[0] || null,
        freight_contract_id: data.freightContractId || null,
        conta_bancaria_id: data.contaBancariaId || null,
        plano_contas_id: data.planoContasId || null,
        status: "emitido",
      };
      const chequeQuery = supabase.from("cheques" as any) as any;
      let existingQuery = chequeQuery.select("id").limit(1);
      if (linkedExpenseIds.length) existingQuery = existingQuery.eq("expense_id", linkedExpenseIds[0]);
      else if (data.freightContractId) existingQuery = existingQuery.eq("freight_contract_id", data.freightContractId);
      else existingQuery = existingQuery.eq("numero_cheque", numeroCheque.trim() || "__sem_numero__");
      const { data: existingCheque } = await existingQuery.maybeSingle();
      const { data: savedCheque, error: chequeError } = existingCheque
        ? await chequeQuery.update(chequePayload).eq("id", existingCheque.id).select("id").single()
        : await chequeQuery.insert(chequePayload).select("id").single();
      if (chequeError) throw chequeError;

      // Vínculos múltiplos cheque <-> contas a pagar
      if (savedCheque?.id) {
        const linksQuery = supabase.from("cheque_expense_links" as any) as any;
        await linksQuery.delete().eq("cheque_id", savedCheque.id);
        if (linkedExpenseIds.length) {
          const { error: linkError } = await linksQuery.insert(
            linkedExpenseIds.map((id) => ({ cheque_id: savedCheque.id, expense_id: id })),
          );
          if (linkError) {
            toast.error("Cheque gerado, mas falhou ao vincular todas as contas", { description: linkError.message });
          }
        }
      }


      // A movimentação bancária do cheque só é efetivada no pagamento (seção Cheques > Pagar)
      toast.success("Cheque gerado e registrado");
      onSaved?.(numeroCheque.trim(), { predatado, dataVencimento: predatado ? dataVencimento : null });
      localStorage.setItem("cheque_cidade", cidade.trim());
    } catch (e: any) {
      toast.error("Erro ao gerar cheque", { description: e?.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfBytes) return;
    downloadPdfBytes(pdfBytes, `cheque_${numeroCheque.trim() || "sem_numero"}.pdf`);
  };





  const handleClose = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPdfBytes(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={pdfBlobUrl ? "max-w-4xl w-[95vw]" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{pdfBlobUrl ? "Visualização de Impressão" : "Emissão de Cheque"}</DialogTitle>
        </DialogHeader>

        {pdfBlobUrl ? (
          <div className="space-y-4">
            <CheckPdfPreview bytes={pdfBytes} />
            <p className="text-[11px] text-muted-foreground">
              Baixe o PDF e imprima pelo leitor de PDF, mantendo "Tamanho real / Escala 100%" e desativando "Ajustar à página".
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
              <Button size="sm" onClick={handleClose} className="gap-1.5">
                <X className="h-4 w-4" />
                Fechar
              </Button>
            </div>
          </div>

        ) : (
          <>
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
                <p className="text-sm font-medium">{data.nominal || "—"}</p>
                <p className="text-sm text-muted-foreground">
                  Valor: <strong className="text-foreground">{formatCurrency(data.valor)}</strong>
                </p>
                <p className="text-xs text-muted-foreground italic">*** {extenso} ***</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Template</Label>
                  <Select value={layoutId} onValueChange={setLayoutId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {layouts.map(l => <SelectItem key={l.id} value={l.id}>{l.banco_nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input className="h-9" value={cidade} onChange={e => setCidade(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Data do cheque</Label>
                  <Input type="date" className="h-9" value={dataCheque} onChange={e => setDataCheque(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Número do cheque</Label>
                  <Input className="h-9" value={numeroCheque} onChange={e => setNumeroCheque(e.target.value)} placeholder="Ex: 000123" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={cruzado} onCheckedChange={v => setCruzado(!!v)} />
                  Cruzar cheque (só depósito em conta)
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={imprimirCanhoto} onCheckedChange={v => setImprimirCanhoto(!!v)} />
                  Imprimir canhoto
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={predatado} onCheckedChange={v => setPredatado(!!v)} />
                  Cheque pré-datado
                </label>
              </div>

              {predatado ? (
                <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-muted/30 p-3">
                  <div>
                    <Label className="text-xs">Bom para (vencimento)</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={dataVencimento}
                      onChange={e => setDataVencimento(e.target.value)}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground self-end pb-1">
                    Esta data será impressa como “BOM PARA” no cheque e no canhoto, e usada como vencimento no Contas a Pagar.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Cheque à vista.</p>
              )}

              <div className="flex items-start gap-2 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 p-3">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  Atenção: use papel A4, Escala 100% (Tamanho Real), Margens Nenhuma e desative “Girar automaticamente”. Para encostar no topo físico, selecione o modo sem bordas da impressora.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button size="sm" onClick={handleGerar} disabled={generating} className="gap-1.5">
                <Printer className="h-4 w-4" />
                {generating ? "Gerando..." : "Gerar Cheque"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
