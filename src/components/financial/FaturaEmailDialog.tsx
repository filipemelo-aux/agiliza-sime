import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { toast } from "@/lib/notice";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { buildHtmlPdf } from "@/lib/htmlToPdf";
import { resolvePrintableHtml } from "@/lib/pdfDownload";
import { buildDactePdf } from "@/components/freight/dactePdf";
import { cteXmlToPrintFields } from "@/lib/cteXmlToPrint";
import { buildBoletosFaturaPdf } from "@/lib/boleto/boletoPdf";

export interface FaturaEmailData {
  html: string;
  cteIds: string[];
  clienteEmail: string;
  clienteNome: string;
  empresaNome: string;
  itens: { descricao: string; data: string; valor: number }[];
  parcelas: { vencimento: string; valor: number }[];
}

interface Props {
  fatura: { id: string; numero: number | string; valor_total: number; data_emissao?: string } | null;
  onOpenChange: (open: boolean) => void;
  build: (fatura: any) => Promise<FaturaEmailData | null>;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Prévia da fatura no corpo do e-mail (estilos inline, compatível com clientes de e-mail). */
function previewHtml(numero: string | number, total: number, d: FaturaEmailData, mensagem: string) {
  const td = "padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px";
  const itens = d.itens.map((i) =>
    `<tr><td style="${td}">${esc(i.descricao)}</td><td style="${td}">${i.data ? esc(formatDateBR(i.data)) : "—"}</td><td style="${td};text-align:right">${esc(formatCurrency(i.valor))}</td></tr>`).join("");
  const parcelas = d.parcelas.map((p, idx) =>
    `<tr><td style="${td}">Parcela ${idx + 1}</td><td style="${td}">${esc(formatDateBR(p.vencimento))}</td><td style="${td};text-align:right">${esc(formatCurrency(p.valor))}</td></tr>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#1f2937">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <p style="font-size:14px;line-height:1.5;white-space:pre-line">${esc(mensagem)}</p>
  <div style="border:1px solid #d1d5db;border-radius:8px;overflow:hidden;margin-top:16px">
    <div style="background:#2B4C7E;color:#ffffff;padding:14px 16px">
      <div style="font-size:12px;opacity:.85">${esc(d.empresaNome)}</div>
      <div style="font-size:18px;font-weight:bold">Fatura Nº ${esc(numero)}</div>
    </div>
    <div style="padding:14px 16px">
      <div style="font-size:13px;margin-bottom:10px"><b>Cliente:</b> ${esc(d.clienteNome)}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f3f4f6"><th style="${td};text-align:left">Item</th><th style="${td};text-align:left">Data</th><th style="${td};text-align:right">Valor</th></tr>
        ${itens || `<tr><td style="${td}" colspan="3">—</td></tr>`}
      </table>
      ${parcelas ? `<div style="font-size:13px;font-weight:bold;margin:14px 0 4px">Vencimentos</div><table style="width:100%;border-collapse:collapse">${parcelas}</table>` : ""}
      <div style="margin-top:14px;padding:10px 12px;background:#F5C518;border-radius:6px;font-size:15px;font-weight:bold;text-align:right">Total: ${esc(formatCurrency(total))}</div>
    </div>
  </div>
  <p style="font-size:12px;color:#6b7280;margin-top:16px">A fatura completa e os documentos relacionados seguem em anexo.</p>
</div></body></html>`;
}

export function FaturaEmailDialog({ fatura, onOpenChange, build }: Props) {
  const [data, setData] = useState<FaturaEmailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (!fatura) { setData(null); return; }
    let alive = true;
    setLoading(true);
    build(fatura)
      .then((d) => {
        if (!alive || !d) return;
        setData(d);
        setTo(d.clienteEmail); setCc(""); setBcc("");
        setSubject(`Fatura Nº ${fatura.numero} — ${d.empresaNome}`);
        setMensagem(`Olá, ${d.clienteNome}.\n\nSegue a fatura Nº ${fatura.numero} no valor de ${formatCurrency(Number(fatura.valor_total))}.`);
      })
      .catch((e) => toast.error(e?.message || "Não foi possível montar a fatura."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [fatura]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!fatura || !data) return;
    const split = (v: string) => v.split(/[;,\s]+/).map((e) => e.trim()).filter(Boolean);
    const valid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const emails = split(to), ccList = split(cc), bccList = split(bcc);
    if (!emails.length || emails.some((e) => !valid(e))) {
      toast.error("Informe um e-mail válido para o destinatário.");
      return;
    }
    const bad = [...ccList, ...bccList].find((e) => !valid(e));
    if (bad) { toast.error(`E-mail inválido em Cópia/Cópia oculta: ${bad}`); return; }
    setSending(true);
    try {
      const attachments: { filename: string; content: string; contentType: string }[] = [];
      const faturaPdf = await buildHtmlPdf(await resolvePrintableHtml(data.html), { marginMm: 20 });
      await buildBoletosFaturaPdf(fatura.id, faturaPdf);
      attachments.push({ filename: `Fatura-${fatura.numero}.pdf`, content: await blobToBase64(faturaPdf.output("blob")), contentType: "application/pdf" });

      if (data.cteIds.length) {
        const { data: ctes, error } = await supabase.from("ctes").select("*").in("id", data.cteIds);
        if (error) throw error;
        for (const c of (ctes || []) as any[]) {
          const fromXml = cteXmlToPrintFields(c.xml_autorizado);
          const input = fromXml ? { ...c, ...fromXml, status: c.status } : c;
          const num = c.tipo_talao === "servico" ? c.numero_interno : (c.numero ?? c.numero_interno);
          const pdf = await buildDactePdf([input]);
          attachments.push({ filename: `CTe-${num || c.id.slice(0, 8)}.pdf`, content: await blobToBase64(pdf.output("blob")), contentType: "application/pdf" });
        }
      }

      const { data: res, error } = await supabase.functions.invoke("send-smtp-email", {
        body: { to: emails, cc: ccList, bcc: bccList, subject, html: previewHtml(fatura.numero, Number(fatura.valor_total), data, mensagem), attachments },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success(`Fatura Nº ${fatura.numero} enviada para ${emails.join(", ")}.`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar o e-mail.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <ProcessingOverlay open={loading || sending} label={sending ? "Gerando anexos e enviando o e-mail..." : "Montando a fatura..."} />
      <Dialog open={!!fatura && !loading} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar fatura Nº {fatura?.numero} por e-mail</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Para</Label>
              <Input className="h-9 text-xs" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@empresa.com.br" />
              <p className="text-[11px] text-muted-foreground">Para mais de um destinatário, separe por vírgula.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Cópia (Cc)</Label>
                <Input className="h-9 text-xs" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="opcional" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cópia oculta (Cco)</Label>
                <Input className="h-9 text-xs" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="opcional" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assunto</Label>
              <Input className="h-9 text-xs" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mensagem</Label>
              <Textarea className="text-xs" rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            </div>
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              Anexos: Fatura Nº {fatura?.numero} (PDF){data?.cteIds.length ? ` e ${data.cteIds.length} CT-e(s) (PDF)` : ""}, mais o boleto quando a fatura tiver boleto gerado. O corpo do e-mail leva uma prévia da fatura.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
            <Button onClick={send} disabled={sending || !data}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
