import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { maskDocument, maskCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { supabase } from "@/integrations/supabase/client";

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  autorizado: "bg-emerald-500/10 text-emerald-600",
  encerrado: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  rejeitado: "bg-amber-500/10 text-amber-600",
  processando: "bg-amber-500/10 text-amber-600",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  autorizado: "Autorizado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
  processando: "Processando",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mdfe: any;
}

const fmt = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR") : null;

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] break-all">{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Separator />
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
        {children}
      </div>
    </>
  );
}

export function MdfeDetailDialog({ open, onOpenChange, mdfe }: Props) {
  const [ctes, setCtes] = useState<{ id: string; numero: number | null; chave_acesso: string | null }[]>([]);

  // Busca os números dos CT-es vinculados
  useEffect(() => {
    if (!open || !mdfe) return;
    const ids: string[] = Array.isArray(mdfe.cte_ids) ? mdfe.cte_ids : [];
    if (!ids.length) { setCtes([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("ctes").select("id, numero, chave_acesso").in("id", ids);
      if (!cancelled) setCtes((data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [open, mdfe?.id]);

  if (!mdfe) return null;

  const condutores = Array.isArray(mdfe.condutores_extras) ? mdfe.condutores_extras : [];
  const vales = Array.isArray(mdfe.vale_pedagio) ? mdfe.vale_pedagio : [];
  const chavesTerceiros = Array.isArray(mdfe.chaves_cte_terceiros) ? mdfe.chaves_cte_terceiros : [];
  const ufsPercurso = Array.isArray(mdfe.ufs_percurso) ? mdfe.ufs_percurso : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-4">
            {`MDF-e ${mdfe.numero ? `Nº ${mdfe.numero}` : "(Sem número)"}`}
            <Badge className={statusColors[mdfe.status]}>
              {statusLabels[mdfe.status] || mdfe.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Percurso */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Percurso</h4>
            <Row label="Carregamento" value={`${mdfe.municipio_carregamento_nome || "—"}/${mdfe.uf_carregamento || ""}`} />
            <Row label="Descarregamento" value={`${mdfe.municipio_descarregamento_nome || "—"}/${mdfe.uf_descarregamento || ""}`} />
            {ufsPercurso.length > 0 && <Row label="UFs do percurso" value={ufsPercurso.join(" → ")} />}
            {mdfe.data_saida && <Row label="Data de saída" value={fmtDateTime(mdfe.data_saida)} />}
            {mdfe.km_inicial != null && <Row label="KM inicial" value={Number(mdfe.km_inicial).toLocaleString("pt-BR")} />}
            {mdfe.conferente && <Row label="Conferente" value={mdfe.conferente} />}
          </div>

          {/* Transporte */}
          <Section title="Transporte">
            <Row label="Placa do cavalo" value={mdfe.placa_veiculo} />
            {mdfe.reboque1_placa && <Row label="Reboque 1" value={mdfe.reboque1_placa} />}
            {mdfe.reboque2_placa && <Row label="Reboque 2" value={mdfe.reboque2_placa} />}
            {mdfe.rntrc && <Row label="RNTRC" value={mdfe.rntrc} />}
          </Section>

          {/* Motorista */}
          <Section title="Motorista">
            <Row label="Nome" value={mdfe.motorista_nome} />
            {mdfe.motorista_cpf && <Row label="CPF" value={maskDocument(mdfe.motorista_cpf)} />}
            {condutores.map((c: any, i: number) => (
              <Row key={i} label={`Condutor ${i + 2}`} value={`${c.nome || ""}${c.cpf ? ` — ${maskDocument(c.cpf)}` : ""}`} />
            ))}
          </Section>

          {/* Contratado / CIOT */}
          {(mdfe.contratado_nome || mdfe.ciot_numero) && (
            <Section title="Contratado / CIOT">
              {mdfe.contratado_nome && <Row label="Contratado" value={mdfe.contratado_nome} />}
              {mdfe.contratado_documento && <Row label="CNPJ/CPF" value={maskDocument(mdfe.contratado_documento)} />}
              {mdfe.ciot_numero && <Row label="CIOT" value={mdfe.ciot_numero} />}
            </Section>
          )}

          {/* Carga */}
          <Section title="Carga">
            {mdfe.produto_predominante && <Row label="Produto predominante" value={mdfe.produto_predominante} />}
            {mdfe.ncm && <Row label="NCM" value={mdfe.ncm} />}
            {mdfe.tipo_carga && <Row label="Tipo de carga" value={mdfe.tipo_carga} />}
            <Row label="Peso total" value={`${Number(mdfe.peso_total || 0).toLocaleString("pt-BR")} kg`} />
            {mdfe.quantidade_total > 0 && <Row label="Quantidade" value={Number(mdfe.quantidade_total).toLocaleString("pt-BR")} />}
            {mdfe.valor_total > 0 && <Row label="Valor total da carga" value={fmt(mdfe.valor_total)} />}
            {mdfe.cep_carregamento && <Row label="CEP carregamento" value={mdfe.cep_carregamento} />}
            {mdfe.cep_descarregamento && <Row label="CEP descarregamento" value={mdfe.cep_descarregamento} />}
          </Section>

          {/* Seguro */}
          {(mdfe.seguradora_nome || mdfe.apolice_numero) && (
            <Section title="Seguro da carga">
              <Row label="Seguradora" value={mdfe.seguradora_nome} />
              {mdfe.seguradora_cnpj && <Row label="CNPJ" value={maskDocument(mdfe.seguradora_cnpj)} />}
              {mdfe.apolice_numero && <Row label="Apólice" value={mdfe.apolice_numero} />}
              {mdfe.averbacao_numero && <Row label="Averbação" value={mdfe.averbacao_numero} />}
            </Section>
          )}

          {/* Vale-pedágio */}
          {vales.length > 0 && (
            <Section title="Vale-pedágio">
              {vales.map((v: any, i: number) => (
                <Row key={i} label={v.fornecedora || v.cnpj_fornecedora || `Vale ${i + 1}`} value={v.numero_compra || v.numero || "—"} />
              ))}
            </Section>
          )}

          {/* CT-es vinculados */}
          {(ctes.length > 0 || chavesTerceiros.length > 0) && (
            <Section title="CT-es vinculados">
              {ctes.map((c) => (
                <Row key={c.id} label={`CT-e Nº ${c.numero ?? "—"}`} value={c.chave_acesso || "Sem chave"} />
              ))}
              {chavesTerceiros.map((ch: string, i: number) => (
                <p key={i} className="text-xs font-mono text-muted-foreground break-all">{ch}</p>
              ))}
            </Section>
          )}

          {mdfe.observacoes && (
            <Section title="Observações">
              <p className="text-sm whitespace-pre-wrap">{mdfe.observacoes}</p>
            </Section>
          )}

          {/* Autorização */}
          {mdfe.chave_acesso && (
            <Section title="Autorização">
              <Row label="Chave de acesso" value={mdfe.chave_acesso} />
              <Row label="Protocolo" value={mdfe.protocolo_autorizacao} />
              <Row label="Data autorização" value={fmtDateTime(mdfe.data_autorizacao)} />
              {mdfe.protocolo_encerramento && <Row label="Prot. encerramento" value={mdfe.protocolo_encerramento} />}
              {mdfe.data_encerramento && <Row label="Data encerramento" value={fmtDateTime(mdfe.data_encerramento)} />}
            </Section>
          )}

          {/* Motivo da rejeição / último erro */}
          {mdfe.motivo_rejeicao && (
            <>
              <Separator />
              <div className="bg-destructive/5 p-3 rounded-lg">
                <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Retorno da SEFAZ</h4>
                <p className="text-sm whitespace-pre-wrap">{mdfe.motivo_rejeicao}</p>
              </div>
            </>
          )}

          <Separator />
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Registro</h4>
            <Row label="Emissão" value={mdfe.data_emissao ? formatDateBR(mdfe.data_emissao) : null} />
            <Row label="Criado em" value={fmtDateTime(mdfe.created_at)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
