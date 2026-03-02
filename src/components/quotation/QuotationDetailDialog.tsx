import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { exportQuotationPDF } from "./exportQuotationPdf";

interface Props {
  quotation: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  establishments: any[];
}

const formatCurrency = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export function QuotationDetailDialog({ quotation: q, open, onOpenChange, establishments }: Props) {
  const isFrete = q.type === "frete";
  const diaria = q.valor_mensal_por_caminhao ? q.valor_mensal_por_caminhao / 30 : null;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cotação #{q.numero}
            <Badge variant="secondary">{isFrete ? "Frete" : "Colheita"}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Row label="Empresa Contratada" value={q.establishment?.nome_fantasia || q.establishment?.razao_social} />
          <Row label="Cliente" value={q.client?.razao_social || q.client?.full_name} />
          <Row label="CNPJ Cliente" value={q.client?.cnpj} />
          <Row label="Responsável" value={q.creator?.full_name} />
          <Row label="Status" value={q.status} />
          <Row label="Criada em" value={format(new Date(q.created_at), "dd/MM/yyyy HH:mm")} />
          <Row label="Validade" value={`${q.validade_dias || 15} dias`} />
        </div>

        <hr className="border-border" />

        {isFrete ? (
          <div className="space-y-1">
            <h3 className="font-semibold text-sm mb-2">Dados do Frete</h3>
            <Row label="Origem" value={`${q.origem_cidade}/${q.origem_uf}`} />
            <Row label="Destino" value={`${q.destino_cidade}/${q.destino_uf}`} />
            <Row label="Produto" value={q.produto} />
            <Row label="Peso (kg)" value={q.peso_kg?.toLocaleString("pt-BR")} />
            <Row label="Valor do Frete" value={formatCurrency(q.valor_frete)} />
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="font-semibold text-sm mb-2">Dados da Colheita</h3>
            <Row label="Previsão Início" value={q.previsao_inicio ? format(new Date(q.previsao_inicio + "T12:00:00"), "dd/MM/yyyy") : null} />
            <Row label="Previsão Término" value={q.previsao_termino ? format(new Date(q.previsao_termino + "T12:00:00"), "dd/MM/yyyy") : null} />
            <Row label="Qtd. Caminhões" value={q.quantidade_caminhoes} />
            <Row label="Valor Mensal/Caminhão" value={formatCurrency(q.valor_mensal_por_caminhao)} />
            <Row label="Diária/Caminhão" value={diaria ? formatCurrency(diaria) : null} />
            <Row label="Alimentação" value={q.alimentacao_por_conta === "contratante" ? "Por conta do Contratante" : "Por conta da Contratada"} />
            {q.alimentacao_por_conta === "contratante" && <Row label="Valor Alimentação/Dia" value={formatCurrency(q.valor_alimentacao_dia)} />}
            {diaria != null && (
              <Row
                label="Diária Total (diária + alimentação)"
                value={formatCurrency(diaria + (q.alimentacao_por_conta === "contratante" && q.valor_alimentacao_dia ? q.valor_alimentacao_dia : 0))}
              />
            )}
            <Row label="Combustível" value={q.combustivel_por_conta === "contratante" ? "Por conta do Contratante" : "Por conta da Contratada"} />
          </div>
        )}

        {q.observacoes && (
          <>
            <hr className="border-border" />
            <div>
              <h3 className="font-semibold text-sm mb-1">Observações</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.observacoes}</p>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => exportQuotationPDF(q, establishments)} className="gap-2">
            <Download className="h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
