import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { valorPorExtenso, quebrarExtenso } from "@/lib/valorExtenso";
import { Printer, AlertTriangle, Download, X, Loader2 } from "lucide-react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";


export interface CheckIssueData {
  expenseId?: string | null;
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
  onSaved?: (numeroCheque: string) => void;
}

type Layout = Record<string, any>;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function CheckIssueDialog({ open, onOpenChange, data, onSaved }: Props) {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [layoutId, setLayoutId] = useState("");
  const [cidade, setCidade] = useState(localStorage.getItem("cheque_cidade") || "Araguaína");
  const [dataCheque, setDataCheque] = useState(data.data || getLocalDateISO());
  const [numeroCheque, setNumeroCheque] = useState(data.numeroCheque || "");
  const [generating, setGenerating] = useState(false);
  const [cruzado, setCruzado] = useState(localStorage.getItem("cheque_cruzado") !== "0");
  const [imprimirCanhoto, setImprimirCanhoto] = useState(localStorage.getItem("cheque_canhoto") !== "0");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    setDataCheque(data.data || getLocalDateISO());
    setNumeroCheque(data.numeroCheque || "");
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

  useEffect(() => {
    if (!pdfBytes || !pdfBlobUrl) return;

    let cancelled = false;
    let loadingTask: { promise: Promise<any>; destroy: () => Promise<void> } | null = null;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const renderPreview = async () => {
      setPreviewLoading(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const canvas = previewCanvasRef.current;
        if (!canvas || cancelled) return;

        const viewport = page.getViewport({ scale: 1.6 });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a visualização");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          console.error("Falha ao renderizar preview do cheque", error);
          toast.error("Não foi possível exibir a pré-visualização", {
            description: "O PDF ainda pode ser baixado pelo botão abaixo.",
          });
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void renderPreview();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [pdfBytes, pdfBlobUrl]);

  const layout = useMemo(() => layouts.find(l => l.id === layoutId), [layouts, layoutId]);
  const extenso = useMemo(() => valorPorExtenso(data.valor), [data.valor]);

  const handleGerar = async () => {
    if (!layout) return toast.error("Selecione um template de cheque");
    if (!cidade.trim()) return toast.error("Informe a cidade");
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      // Folha A4 retrato fixa: o cheque é impresso no topo da folha, usando as
      // coordenadas X/Y (mm) definidas no template.
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        putOnlyUsedFonts: true,
        compress: false,
      });
      (doc as any).setDisplayMode?.("fullwidth");
      (doc as any).viewerPreferences?.({
        PrintScaling: "None",
        PickTrayByPDFSize: true,
      });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Ocupa a caixa completa da página sem produzir marca visível. Isso evita
      // que drivers (especialmente o macOS) detectem apenas o cheque horizontal
      // no topo e ativem a rotação/centralização automática do conteúdo.
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.01);
      doc.rect(0, 0, pageW, pageH);
      doc.setFont("courier", "normal");
      doc.setFontSize(10);

      const [d, m, y] = [
        Number(dataCheque.slice(8, 10)),
        Number(dataCheque.slice(5, 7)),
        dataCheque.slice(0, 4),
      ];

      const valorStr = formatCurrency(data.valor).replace("R$", "").trim();
      // Antifraude: extenso encapsulado por asteriscos
      const extensoProtegido = `*** ${extenso} ***`;

      const ext1X = Number(layout.valor_extenso1_x);
      // 2ª linha usa exatamente o X configurado no template
      const ext2X = Number(layout.valor_extenso2_x);

      // Largura útil = largura da folha configurada (limitada à página A4)
      const folhaW = Math.min(Number(layout.largura_folha_mm) || pageW, pageW);
      const larguraChar = doc.getTextWidth("0") || 1.9;
      const maxChars1 = Math.max(10, Math.floor((folhaW - ext1X) / larguraChar));
      const [linha1, linha2] = quebrarExtenso(extensoProtegido, maxChars1);

      // Corpo do cheque
      doc.setFont("courier", "bold");
      doc.text(`# ${valorStr} #`, Number(layout.valor_numerico_x), Number(layout.valor_numerico_y));
      doc.setFont("courier", "normal");
      // Cada linha exatamente na coordenada X/Y definida no template
      doc.text(linha1, ext1X, Number(layout.valor_extenso1_y), { baseline: "alphabetic" });
      if (linha2) doc.text(linha2, ext2X, Number(layout.valor_extenso2_y), { baseline: "alphabetic" });
      doc.text(data.nominal || "", Number(layout.nominal_x), Number(layout.nominal_y));
      doc.text(
        `${cidade.trim()}, ${String(d).padStart(2, "0")} de ${MESES[m - 1] || ""} de ${y}`,
        Number(layout.cidade_data_x),
        Number(layout.cidade_data_y),
      );

      // Cheque cruzado: duas diagonais ocupando toda a altura do cheque
      if (cruzado) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        const folhaH = Math.min(Number(layout.altura_folha_mm) || 90, pageH);
        const canhotoDireita = Number(layout.canhoto_valor_x) > folhaW / 2;
        const topo = 2;
        const base = Math.max(topo + 5, folhaH - 2);
        const desloc = base - topo; // inclinação 45°
        if (canhotoDireita) {
          doc.line(6, topo, 6 + desloc, base);
          doc.line(12, topo, 12 + desloc, base);
        } else {
          doc.line(folhaW - 6, topo, folhaW - 6 - desloc, base);
          doc.line(folhaW - 12, topo, folhaW - 12 - desloc, base);
        }
        doc.setDrawColor(255, 255, 255);
      }



      // Canhoto — cada campo exatamente na coordenada definida no template
      if (imprimirCanhoto) {
        doc.setFontSize(8);
        doc.text(valorStr, Number(layout.canhoto_valor_x), Number(layout.canhoto_valor_y), { baseline: "alphabetic" });
        doc.text(formatDateBR(dataCheque), Number(layout.canhoto_data_x), Number(layout.canhoto_data_y), { baseline: "alphabetic" });
        doc.text(data.nominal || "", Number(layout.canhoto_favorecido_x), Number(layout.canhoto_favorecido_y), { baseline: "alphabetic" });
        doc.text(data.historico || "", Number(layout.canhoto_referente_x), Number(layout.canhoto_referente_y), { baseline: "alphabetic" });
        doc.setFontSize(10);
      }


      // Preview interno via iframe (evita bloqueios de pop-up e URLs blob em nova aba)
      const arrayBuffer = doc.output("arraybuffer");
      const bytes = new Uint8Array(arrayBuffer);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      setPdfBytes(bytes);
      setPdfBlobUrl(blobUrl);

      localStorage.setItem("cheque_cruzado", cruzado ? "1" : "0");
      localStorage.setItem("cheque_canhoto", imprimirCanhoto ? "1" : "0");

      if (numeroCheque.trim() && data.expenseId) {
        const { error } = await supabase
          .from("expenses")
          .update({ numero_cheque: numeroCheque.trim() } as any)
          .eq("id", data.expenseId);
        if (error) toast.error("Cheque gerado, mas falhou ao salvar o número", { description: error.message });
        else toast.success("Cheque gerado e número salvo na despesa");
      } else {
        toast.success("Cheque gerado");
      }
      onSaved?.(numeroCheque.trim());
      localStorage.setItem("cheque_cidade", cidade.trim());
    } catch (e: any) {
      toast.error("Erro ao gerar cheque", { description: e?.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `cheque_${numeroCheque.trim() || "sem_numero"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
            <div className="relative h-[600px] overflow-auto rounded-md border border-border bg-muted/30 p-3">
              {previewLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <canvas
                ref={previewCanvasRef}
                className="mx-auto block h-auto w-full max-w-[794px] bg-background shadow-sm"
                aria-label="Visualização do cheque"
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
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
              </div>

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
                {generating ? "Gerando..." : "Gerar e Imprimir Cheque"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
