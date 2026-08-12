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
import { Printer, AlertTriangle } from "lucide-react";


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

  useEffect(() => {
    if (!open) return;
    setDataCheque(data.data || getLocalDateISO());
    setNumeroCheque(data.numeroCheque || "");
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

  const layout = useMemo(() => layouts.find(l => l.id === layoutId), [layouts, layoutId]);
  const extenso = useMemo(() => valorPorExtenso(data.valor), [data.valor]);

  const handleGerar = async () => {
    if (!layout) return toast.error("Selecione um template de cheque");
    if (!cidade.trim()) return toast.error("Informe a cidade");
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const w = Number(layout.largura_folha_mm);
      const h = Number(layout.altura_folha_mm);
      const doc = new jsPDF({
        orientation: w >= h ? "landscape" : "portrait",
        unit: "mm",
        format: [w, h],
      });
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
      const [linha1, linha2] = quebrarExtenso(extensoProtegido, 62);

      // Corpo do cheque
      doc.setFont("courier", "bold");
      doc.text(`# ${valorStr} #`, Number(layout.valor_numerico_x), Number(layout.valor_numerico_y));
      doc.setFont("courier", "normal");
      doc.text(linha1, Number(layout.valor_extenso1_x), Number(layout.valor_extenso1_y));
      if (linha2) doc.text(linha2, Number(layout.valor_extenso2_x), Number(layout.valor_extenso2_y));
      doc.text(data.nominal || "", Number(layout.nominal_x), Number(layout.nominal_y));
      doc.text(
        `${cidade.trim()}, ${String(d).padStart(2, "0")} de ${MESES[m - 1] || ""} de ${y}`,
        Number(layout.cidade_data_x),
        Number(layout.cidade_data_y),
      );

      // Cheque cruzado: duas diagonais paralelas no canto superior esquerdo
      if (cruzado) {
        const x0 = Number(layout.canhoto_valor_x) ? 0 : 0;
        const base = w * 0.35; // origem horizontal das diagonais
        doc.setLineWidth(0.5);
        doc.line(base * 0.35 + x0, 2, base * 0.6 + x0, h * 0.32);
        doc.line(base * 0.5 + x0, 2, base * 0.75 + x0, h * 0.32);
      }

      // Canhoto
      if (imprimirCanhoto) {
        doc.setFontSize(8);
        doc.text(valorStr, Number(layout.canhoto_valor_x), Number(layout.canhoto_valor_y));
        doc.text(formatDateBR(dataCheque), Number(layout.canhoto_data_x), Number(layout.canhoto_data_y));
        doc.text((data.nominal || "").slice(0, 34), Number(layout.canhoto_favorecido_x), Number(layout.canhoto_favorecido_y));
        doc.text((data.historico || "").slice(0, 34), Number(layout.canhoto_referente_x), Number(layout.canhoto_referente_y));
      }

      // Preview em nova aba (sem download automático)
      const blobUrl = URL.createObjectURL(doc.output("blob"));
      const win = window.open(blobUrl, "_blank");
      if (!win) toast.warning("Permita pop-ups para visualizar o cheque");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Emissão de Cheque</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-medium">{data.nominal || "—"}</p>
            <p className="text-sm text-muted-foreground">
              Valor: <strong className="text-foreground">{formatCurrency(data.valor)}</strong>
            </p>
            <p className="text-xs text-muted-foreground italic">{extenso}</p>
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
      </DialogContent>
    </Dialog>
  );
}
