import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Send, Loader2, Pencil, FileSignature, Printer } from "lucide-react";
import { maskCNPJ, maskCurrency } from "@/lib/masks";
import { useToast } from "@/hooks/use-toast";
import { emitirCteViaService } from "@/services/fiscal/fiscalServiceClient";
import { prepararCteParaTransmissao } from "@/services/fiscal/prepareCteXml";
import { supabase } from "@/integrations/supabase/client";
import { FreightContractDialog } from "./FreightContractDialog";
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

const TOMADOR_LABELS: Record<number, string> = {
  0: "Remetente", 1: "Expedidor", 2: "Recebedor", 3: "Destinatário", 4: "Outros",
};

const TP_CTE_LABELS: Record<number, string> = {
  0: "Normal", 1: "Complementar", 2: "Anulação", 3: "Substituto",
};

const TP_SERV_LABELS: Record<number, string> = {
  0: "Normal", 1: "Subcontratação", 2: "Redespacho", 3: "Redesp. Intermediário", 4: "Multimodal",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte;
  onUpdated: () => void;
  onEdit?: (cte: Cte) => void;
}

const fmt = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] break-all">{value || "—"}</span>
    </div>
  );
}

function ActorBlock({ title, nome, cnpj, ie, endereco, uf }: { title: string; nome?: string; cnpj?: string; ie?: string; endereco?: string; uf?: string }) {
  if (!nome) return null;
  return (
    <>
      <Separator />
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
        <Row label="Nome" value={nome} />
        {cnpj && <Row label="CNPJ/CPF" value={maskCNPJ(cnpj)} />}
        {ie && <Row label="IE" value={ie} />}
        {endereco && <Row label="Endereço" value={endereco} />}
        {uf && <Row label="UF" value={uf} />}
      </div>
    </>
  );
}

export function CteDetailDialog({ open, onOpenChange, cte: cteProp, onUpdated, onEdit }: Props) {
  const [transmitting, setTransmitting] = useState(false);
  const [localCte, setLocalCte] = useState(cteProp);
  const [contractOpen, setContractOpen] = useState(false);
  const [existingContract, setExistingContract] = useState<{ id: string; numero: number } | null>(null);
  const { toast } = useToast();

  // Sync with prop when dialog opens with a different CTE
  useState(() => { setLocalCte(cteProp); });
  if (cteProp.id !== localCte.id) setLocalCte(cteProp);

  const cte = localCte;
  const isServico = (cte as any).tipo_talao === "servico";
  const canEdit = isServico || cte.status === "rascunho" || cte.status === "rejeitado";
  const canTransmit = !isServico && (cte.status === "rascunho" || cte.status === "rejeitado");

  // Look up existing contract for this CT-e
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("freight_contracts")
        .select("id, numero")
        .eq("cte_id", cte.id)
        .maybeSingle();
      if (!cancelled) setExistingContract(data || null);
    })();
    return () => { cancelled = true; };
  }, [open, cte.id, contractOpen]);

  const handlePrintContract = async () => {
    if (!existingContract) return;
    const { data, error } = await supabase
      .from("freight_contracts")
      .select("*")
      .eq("id", existingContract.id)
      .single();
    if (error || !data) {
      toast({ title: "Erro", description: error?.message || "Contrato não encontrado", variant: "destructive" });
      return;
    }
    const html = buildStoredContractHtml(data);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) w.onload = () => setTimeout(() => w.print(), 400);
  };

  const handleTransmit = async () => {
    setTransmitting(true);
    try {
      // 1. Montar XML no frontend e salvar no banco
      const prep = await prepararCteParaTransmissao(cte.id);
      if (!prep.success) {
        toast({
          title: "Erro na preparação do XML",
          description: prep.errors?.join("; ") || "Erro desconhecido",
          variant: "destructive",
        });
        setTransmitting(false);
        return;
      }

      // 2. Chamar fiscal-service (que agora usará o xml_enviado já pronto)
      const result = await emitirCteViaService(cte.id, { sync: true });
      if (result.success && result.data?.success) {
        const d = result.data;
        if (d.status === "autorizado") {
          toast({ title: "CT-e Autorizado!", description: `Chave: ${d.chave_acesso || "—"} | Protocolo: ${d.protocolo || "—"}` });
        } else {
          toast({ title: "CT-e transmitido", description: "Enviado com sucesso para processamento." });
        }
        onUpdated();
        onOpenChange(false);
      } else {
        const motivo = result.data?.motivo_rejeicao || result.error || "Erro desconhecido";
        const cStat = result.data?.cStat;
        toast({
          title: cStat ? `Rejeitado (cStat: ${cStat})` : "Erro na transmissão",
          description: motivo,
          variant: "destructive",
        });
        // Update local state immediately so the user sees the error and can edit/retransmit
        setLocalCte(prev => ({
          ...prev,
          status: "rejeitado",
          motivo_rejeicao: motivo,
          numero: result.data?.numero || prev.numero,
        }));
        onUpdated();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTransmitting(false);
    }
  };

  const componentes = Array.isArray(cte.componentes_frete) ? cte.componentes_frete : [];
  const quantidades = Array.isArray(cte.info_quantidade) ? cte.info_quantidade : [];
  const chavesNfe = Array.isArray(cte.chaves_nfe_ref) ? cte.chaves_nfe_ref : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-4">
            CT-e {cte.numero ? `Nº ${cte.numero}` : "(Sem número)"}
            <Badge className={statusColors[cte.status]}>
              {statusLabels[cte.status] || cte.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Tipo */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo</h4>
            <Row label="Tipo CT-e" value={TP_CTE_LABELS[cte.tp_cte] || "Normal"} />
            <Row label="Tipo Serviço" value={TP_SERV_LABELS[cte.tp_serv] || "Normal"} />
            <Row label="Modal" value={cte.modal === "01" ? "Rodoviário" : cte.modal} />
          </div>

          {/* Remetente */}
          <ActorBlock title="Remetente" nome={cte.remetente_nome} cnpj={cte.remetente_cnpj} ie={cte.remetente_ie} endereco={cte.remetente_endereco} uf={cte.remetente_uf} />

          {/* Destinatário */}
          <ActorBlock title="Destinatário" nome={cte.destinatario_nome} cnpj={cte.destinatario_cnpj} ie={cte.destinatario_ie} endereco={cte.destinatario_endereco} uf={cte.destinatario_uf} />

          {/* Expedidor */}
          <ActorBlock title="Expedidor" nome={cte.expedidor_nome} cnpj={cte.expedidor_cnpj} ie={cte.expedidor_ie} endereco={cte.expedidor_endereco} uf={cte.expedidor_uf} />

          {/* Recebedor */}
          <ActorBlock title="Recebedor" nome={cte.recebedor_nome} cnpj={cte.recebedor_cnpj} ie={cte.recebedor_ie} endereco={cte.recebedor_endereco} uf={cte.recebedor_uf} />

          {/* Tomador */}
          <Separator />
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tomador do Serviço</h4>
            <Row label="Tomador" value={TOMADOR_LABELS[cte.tomador_tipo] || "Destinatário"} />
            {cte.tomador_tipo === 4 && cte.tomador_nome && (
              <>
                <Row label="Nome" value={cte.tomador_nome} />
                {cte.tomador_cnpj && <Row label="CNPJ/CPF" value={maskCNPJ(cte.tomador_cnpj)} />}
                {cte.tomador_ie && <Row label="IE" value={cte.tomador_ie} />}
              </>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prestação</h4>
            <Row label="Origem" value={`${cte.municipio_origem_nome || ""} - ${cte.uf_origem || ""}`} />
            <Row label="Destino" value={`${cte.municipio_destino_nome || ""} - ${cte.uf_destino || ""}`} />
            {cte.municipio_envio_nome && <Row label="Município Envio" value={`${cte.municipio_envio_nome} - ${cte.uf_envio || ""}`} />}
            <Row label="CFOP" value={cte.cfop} />
            <Row label="Natureza" value={cte.natureza_operacao} />
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Valores</h4>
            <Row label="Valor Frete (vTPrest)" value={fmt(cte.valor_frete)} />
            {cte.valor_receber > 0 && <Row label="Valor a Receber (vRec)" value={fmt(cte.valor_receber)} />}
            <Row label="Valor Carga" value={fmt(cte.valor_carga)} />
            {cte.valor_carga_averb > 0 && <Row label="Valor Carga Averb." value={fmt(cte.valor_carga_averb)} />}
            <Row label="Base ICMS" value={fmt(cte.base_calculo_icms)} />
            <Row label="Alíq. ICMS" value={`${cte.aliquota_icms}%`} />
            <Row label="Valor ICMS" value={fmt(cte.valor_icms)} />
            {cte.valor_total_tributos > 0 && <Row label="Total Tributos" value={fmt(cte.valor_total_tributos)} />}

            {componentes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Componentes do Frete:</p>
                {componentes.map((c: any, i: number) => (
                  <Row key={i} label={c.xNome} value={fmt(c.vComp)} />
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Carga</h4>
            {cte.produto_predominante && <Row label="Produto" value={cte.produto_predominante} />}
            {cte.peso_bruto > 0 && <Row label="Peso Bruto" value={`${Number(cte.peso_bruto).toLocaleString("pt-BR")} kg`} />}
            {quantidades.length > 0 && (
              <div className="mt-1">
                {quantidades.map((q: any, i: number) => (
                  <Row key={i} label={q.tpMed} value={`${Number(q.qCarga).toLocaleString("pt-BR")} (${q.cUnid})`} />
                ))}
              </div>
            )}
          </div>

          {chavesNfe.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">NF-e Referenciadas</h4>
                {chavesNfe.map((ch: string, i: number) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground break-all">{ch}</p>
                ))}
              </div>
            </>
          )}

          <Separator />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Transporte</h4>
            <Row label="Placa" value={cte.placa_veiculo} />
            <Row label="RNTRC" value={cte.rntrc} />
          </div>

          {cte.observacoes && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Observações</h4>
                <p className="text-sm whitespace-pre-wrap">{cte.observacoes}</p>
              </div>
            </>
          )}

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

          {canEdit && (
            <>
              <Separator />
              <div className="flex gap-2">
                {onEdit && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit(cte);
                    }}
                    className="flex-1 gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar CT-e
                  </Button>
                )}
                {canTransmit && (
                  <Button
                    onClick={handleTransmit}
                    disabled={transmitting}
                    className="flex-1 gap-2"
                  >
                    {transmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transmitindo...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {cte.status === "rejeitado" ? "Retransmitir para SEFAZ" : "Transmitir para SEFAZ"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Contrato de Frete */}
          <Separator />
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Contrato de Frete
            </h4>
            {existingContract ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">
                  Contrato Nº <span className="font-semibold">{String(existingContract.numero).padStart(6, "0")}</span> gerado.
                </p>
                <Button size="sm" variant="outline" onClick={handlePrintContract} className="gap-1">
                  <Printer className="w-4 h-4" /> Imprimir
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setContractOpen(true)} className="gap-2">
                <FileSignature className="w-4 h-4" />
                Gerar Contrato de Frete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      <FreightContractDialog
        open={contractOpen}
        onOpenChange={setContractOpen}
        cte={cte}
        onSaved={() => { onUpdated(); }}
      />
    </Dialog>
  );
}

// HTML do contrato a partir do registro persistido
function buildStoredContractHtml(c: any) {
  const fmt = (v: number) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pesoTon = (Number(c.peso_kg) || 0) / 1000;
  const dataExt = new Date(c.created_at || c.data_contrato).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato de Frete Nº ${c.numero}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.45; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 10pt; color: #555; margin-bottom: 18px; }
  table.parties { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10pt; }
  table.parties th, table.parties td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
  table.parties th { background: #f1f1f1; width: 28%; }
  h2 { font-size: 11pt; margin: 14px 0 6px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 2px; }
  p { margin: 4px 0; text-align: justify; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 10pt; }
  .grid div b { display: inline-block; min-width: 140px; }
  .sign { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sign .line { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 10pt; }
  .total-box { margin-top: 8px; padding: 8px 12px; background: #f5f5f5; border-left: 4px solid #2B4C7E; font-size: 11pt; }
</style></head><body>
<h1>Contrato de Prestação de Serviço de Frete</h1>
<div class="sub">Contrato Nº ${String(c.numero).padStart(6, "0")} — ${dataExt}</div>
<table class="parties">
  <tr><th>CONTRATANTE</th><td><b>SIME TRANSPORTE LTDA</b></td></tr>
  <tr><th>CONTRATADO</th><td>
    <b>${c.contratado_nome || "-"}</b><br/>
    ${c.contratado_tipo === "PJ" ? "CNPJ" : "CPF"}: ${c.contratado_documento || "-"} — Tipo: ${c.contratado_tipo || "PF"}
  </td></tr>
</table>
<h2>1. Objeto</h2>
<p>O presente instrumento tem por objeto a contratação, pela CONTRATANTE, do serviço de transporte rodoviário de cargas a ser executado pelo CONTRATADO, observadas as condições, valores e responsabilidades estabelecidas neste contrato.</p>
<h2>2. Trecho e Carga</h2>
<div class="grid">
  <div><b>Origem:</b> ${c.municipio_origem || "-"}/${c.uf_origem || "--"}</div>
  <div><b>Destino:</b> ${c.municipio_destino || "-"}/${c.uf_destino || "--"}</div>
  <div><b>Natureza:</b> ${c.natureza_carga || "-"}</div>
  <div><b>Peso:</b> ${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t (${Number(c.peso_kg || 0).toLocaleString("pt-BR")} kg)</div>
</div>
<h2>3. Veículo e Motorista</h2>
<div class="grid">
  <div><b>Placa:</b> ${c.placa_veiculo || "-"}</div>
  <div><b>Modelo:</b> ${c.veiculo_modelo || "-"}</div>
  <div><b>Motorista:</b> ${c.motorista_nome || "-"}</div>
  <div><b>CPF:</b> ${c.motorista_cpf || "-"}</div>
</div>
<h2>4. Valor e Forma de Pagamento</h2>
<div class="grid">
  <div><b>Valor por tonelada:</b> ${fmt(Number(c.valor_tonelada))}</div>
  <div><b>Peso transportado:</b> ${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</div>
</div>
<div class="total-box"><b>Valor total do frete:</b> ${fmt(Number(c.valor_total))} — Vencimento à vista, em nome do CONTRATADO.</div>
<h2>5. Obrigações do Contratado</h2>
<p>O CONTRATADO se obriga a executar o transporte com diligência, observando legislação de trânsito e RNTRC, zelando pela integridade da carga até a entrega no destino indicado.</p>
<h2>6. Obrigações da Contratante</h2>
<p>A CONTRATANTE se obriga a efetuar o pagamento do valor pactuado conforme cláusula 4ª, mediante apresentação de comprovante de entrega da carga.</p>
<h2>7. Disposições Gerais</h2>
<p>${c.observacoes ? c.observacoes : "Aplicam-se a este contrato, no que couberem, as disposições do Código Civil e da Lei nº 11.442/2007."}</p>
<div class="sign">
  <div class="line">CONTRATANTE<br/>SIME TRANSPORTE LTDA</div>
  <div class="line">CONTRATADO<br/>${c.contratado_nome || ""}</div>
</div>
</body></html>`;
}

