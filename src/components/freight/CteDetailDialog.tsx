import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { maskCNPJ } from "@/lib/masks";
import type { Cte } from "@/pages/FreightCte";

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  autorizado: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  rejeitado: "bg-amber-500/10 text-amber-600",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  autorizado: "Autorizado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte;
  onUpdated: () => void;
}

const fmt = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
}

export function CteDetailDialog({ open, onOpenChange, cte }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-3">
            CT-e {cte.numero ? `Nº ${cte.numero}` : "(Sem número)"}
            <Badge className={statusColors[cte.status]}>
              {statusLabels[cte.status] || cte.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Remetente</h4>
            <Row label="Nome" value={cte.remetente_nome} />
            <Row label="CNPJ" value={cte.remetente_cnpj ? maskCNPJ(cte.remetente_cnpj) : null} />
            <Row label="UF" value={cte.remetente_uf} />
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Destinatário</h4>
            <Row label="Nome" value={cte.destinatario_nome} />
            <Row label="CNPJ" value={cte.destinatario_cnpj ? maskCNPJ(cte.destinatario_cnpj) : null} />
            <Row label="UF" value={cte.destinatario_uf} />
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prestação</h4>
            <Row label="Origem" value={`${cte.municipio_origem_nome || ""} - ${cte.uf_origem || ""}`} />
            <Row label="Destino" value={`${cte.municipio_destino_nome || ""} - ${cte.uf_destino || ""}`} />
            <Row label="CFOP" value={cte.cfop} />
            <Row label="Natureza" value={cte.natureza_operacao} />
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Valores</h4>
            <Row label="Valor Frete" value={fmt(cte.valor_frete)} />
            <Row label="Base ICMS" value={fmt(cte.base_calculo_icms)} />
            <Row label="Alíq. ICMS" value={`${cte.aliquota_icms}%`} />
            <Row label="Valor ICMS" value={fmt(cte.valor_icms)} />
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Transporte</h4>
            <Row label="Placa" value={cte.placa_veiculo} />
            <Row label="RNTRC" value={cte.rntrc} />
          </div>

          {cte.chave_acesso && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Autorização</h4>
                <Row label="Chave de Acesso" value={cte.chave_acesso} />
                <Row label="Protocolo" value={cte.protocolo_autorizacao} />
                <Row label="Data Autorização" value={cte.data_autorizacao ? new Date(cte.data_autorizacao).toLocaleString("pt-BR") : null} />
              </div>
            </>
          )}

          {cte.motivo_rejeicao && (
            <>
              <Separator />
              <div className="bg-destructive/5 p-3 rounded-lg">
                <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Motivo da Rejeição</h4>
                <p className="text-sm">{cte.motivo_rejeicao}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
