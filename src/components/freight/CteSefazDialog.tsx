import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, FileDown, FileCode2, Ban, FilePenLine, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SefazIcon } from "@/components/icons/SefazIcon";

interface Props {
  cte: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onTransmit: () => void;
  onDownloadPdf: () => Promise<void>;
  onChanged: () => void;
}

type View = "menu" | "cancel" | "cce";

export function CteSefazDialog({ cte, open, onOpenChange, onTransmit, onDownloadPdf, onChanged }: Props) {
  const { toast } = useToast();
  const [view, setView] = useState<View>("menu");
  const [busy, setBusy] = useState<string | null>(null);
  const [just, setJust] = useState("");
  const [cce, setCce] = useState({ grupo_corrigido: "", campo_corrigido: "", valor_corrigido: "" });

  if (!cte) return null;
  const isServico = cte.tipo_talao === "servico";
  const st = cte.status as string;
  const canTransmit = !isServico && ["rascunho", "rejeitado", "processando"].includes(st);
  const authorized = !isServico && st === "autorizado";
  const emitted = !isServico && ["autorizado", "cancelado", "processando", "rejeitado"].includes(st);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("focus-nfe", { body: { action, cte_id: cte.id, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) {
      toast({ title: "SEFAZ", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const close = (v: boolean) => { if (!v) { setView("menu"); setJust(""); setCce({ grupo_corrigido: "", campo_corrigido: "", valor_corrigido: "" }); } onOpenChange(v); };

  const options = [
    { key: "transmit", label: st === "processando" ? "Consultar retorno e concluir" : st === "rejeitado" ? "Retransmitir à SEFAZ" : "Transmitir à SEFAZ", icon: Send, enabled: canTransmit,
      onClick: () => { close(false); onTransmit(); } },
    { key: "status", label: "Consultar situação na SEFAZ", icon: RefreshCw, enabled: emitted,
      onClick: () => run("status", async () => {
        const d = await call("consultar_cte_salvo");
        toast({ title: `Situação: ${d.status || "não encontrado"}`, description: [d.mensagem, d.protocolo && `Protocolo ${d.protocolo}`].filter(Boolean).join(" | ") || undefined });
      }) },
    { key: "pdf", label: "Baixar DACTE (PDF)", icon: FileDown, enabled: true,
      onClick: () => run("pdf", onDownloadPdf) },
    { key: "xml", label: "Baixar XML autorizado", icon: FileCode2, enabled: authorized || st === "cancelado",
      onClick: () => run("xml", async () => {
        const d = await call("xml_cte_salvo");
        const blob = new Blob([d.xml], { type: "application/xml" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${cte.chave_acesso || `CTe-${cte.numero}`}.xml`;
        a.click();
        URL.revokeObjectURL(a.href);
      }) },
    { key: "cce", label: "Carta de Correção (CC-e)", icon: FilePenLine, enabled: authorized, onClick: () => setView("cce") },
    { key: "cancel", label: "Cancelar na SEFAZ", icon: Ban, enabled: authorized, onClick: () => setView("cancel"), danger: true },
  ];

  return (
    <Dialog open={open} onOpenChange={close}>
      <ProcessingOverlay open={!!busy} label={({status:"Consultando a SEFAZ...",pdf:"Gerando DACTE (PDF)...",xml:"Baixando XML...",cancel:"Cancelando na SEFAZ...",cce:"Enviando Carta de Correção..."} as Record<string,string>)[busy||""] || "Processando na SEFAZ..."} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><SefazIcon size={22} /> SEFAZ — CT-e {cte.numero ?? cte.numero_interno ?? ""}</DialogTitle>
          <DialogDescription className="text-xs">
            Situação atual: <b>{isServico ? "Interno (serviço)" : st}</b>{cte.chave_acesso ? ` · Chave ${cte.chave_acesso}` : ""}
          </DialogDescription>
        </DialogHeader>

        {view === "menu" && (
          <div className="grid gap-2">
            {options.map((o) => (
              <Button key={o.key} variant={o.danger ? "destructive" : "outline"} className="h-10 justify-start gap-2"
                disabled={!o.enabled || !!busy} onClick={o.onClick}>
                {busy === o.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <o.icon className="w-4 h-4" />}
                {o.label}
              </Button>
            ))}
            <p className="text-[11px] text-muted-foreground">Cancelamento e carta de correção só ficam disponíveis para CT-e autorizado. O cancelamento deve ser feito em até 7 dias após a autorização.</p>
          </div>
        )}

        {view === "cancel" && (
          <div className="grid gap-2">
            <Label className="text-xs">Justificativa do cancelamento (15 a 255 caracteres)</Label>
            <Textarea value={just} onChange={(e) => setJust(e.target.value)} maxLength={255} rows={4} className="text-xs" />
            <span className="text-[11px] text-muted-foreground">{just.trim().length}/255</span>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="h-10" onClick={() => setView("menu")}>Voltar</Button>
              <Button variant="destructive" className="h-10" disabled={just.trim().length < 15 || !!busy}
                onClick={() => run("cancel", async () => {
                  const d = await call("cancelar_cte_salvo", { justificativa: just.trim() });
                  if (!d.success) throw new Error(d.motivo);
                  toast({ title: "CT-e cancelado na SEFAZ", description: d.protocolo ? `Protocolo ${d.protocolo}` : undefined });
                  onChanged(); close(false);
                })}>
                {busy === "cancel" && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Confirmar cancelamento
              </Button>
            </div>
          </div>
        )}

        {view === "cce" && (
          <div className="grid gap-2">
            <p className="text-[11px] text-muted-foreground">Não é permitido corrigir valores, impostos, remetente, destinatário, tomador ou datas. Ex.: grupo "ide", campo "natOp".</p>
            <Label className="text-xs">Grupo do XML</Label>
            <Input className="h-9 text-xs" value={cce.grupo_corrigido} onChange={(e) => setCce({ ...cce, grupo_corrigido: e.target.value })} />
            <Label className="text-xs">Campo</Label>
            <Input className="h-9 text-xs" value={cce.campo_corrigido} onChange={(e) => setCce({ ...cce, campo_corrigido: e.target.value })} />
            <Label className="text-xs">Valor correto</Label>
            <Input className="h-9 text-xs" value={cce.valor_corrigido} onChange={(e) => setCce({ ...cce, valor_corrigido: e.target.value })} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="h-10" onClick={() => setView("menu")}>Voltar</Button>
              <Button className="h-10" disabled={!cce.grupo_corrigido || !cce.campo_corrigido || !cce.valor_corrigido || !!busy}
                onClick={() => run("cce", async () => {
                  const d = await call("cce_cte_salvo", cce);
                  if (!d.success) throw new Error(d.motivo);
                  toast({ title: "Carta de correção registrada" });
                  close(false);
                })}>
                {busy === "cce" && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Enviar CC-e
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
