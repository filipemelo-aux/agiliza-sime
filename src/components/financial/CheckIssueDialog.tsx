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
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { valorPorExtenso, quebrarExtenso } from "@/lib/valorExtenso";
import { Printer, AlertTriangle, Download, X } from "lucide-react";


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

  useEffect(() => {
    if (!open) return;
    setDataCheque(data.data || getLocalDateISO());
    setNumeroCheque(data.numeroCheque || "");
    setPdfBlobUrl(null);
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
      const pageW = doc.internal.pageSize.getWidth();
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
      const ext2X = ext1X; // 2ª linha alinhada à esquerda da primeira

      // Quebra pela largura útil da 1ª linha até a borda da folha A4
      const larguraChar = doc.getTextWidth("0") || 1.9;
      const maxChars1 = Math.max(10, Math.floor((pageW - ext1X - 5) / larguraChar));
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

      // Cheque cruzado: duas diagonais curtas no canto oposto ao canhoto
      if (cruzado) {
        doc.setLineWidth(0.5);
        const canhotoDireita = Number(layout.canhoto_valor_x) > pageW / 2;
        if (canhotoDireita) {
          doc.line(8, 5, 22, 18);
          doc.line(13, 5, 27, 18);
        } else {
          doc.line(pageW - 8, 5, pageW - 22, 18);
          doc.line(pageW - 13, 5, pageW - 27, 18);
        }
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
      const blob = doc.output("blob");
      const blobUrl = URL.createObjectURL(blob);
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
            <iframe
              src={pdfBlobUrl}
              width="100%"
              height="600px"
              style={{ border: "none" }}
              title="Visualização do cheque"
            />
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
                  Atenção: Na hora de imprimir o PDF, configure a impressora para Escala 100% (Tamanho Real).
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
