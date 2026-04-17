import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportFuelOrderPDF } from "./exportFuelOrderPdf";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  unifiedLabel: string;
  unifiedCnpjs: string;
  onStatusChanged?: (orderId: string, newStatus: string) => void;
}

async function resolveSessionRequesterName() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "";

  const metaName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim();
  if (metaName) return metaName;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, category, email, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const byCategory = data?.find((p) => p.category === "motorista" && p.full_name?.trim());
  if (byCategory) return byCategory.full_name.trim();

  const byEmail = data?.find(
    (p) =>
      p.full_name?.trim() &&
      p.email &&
      user.email &&
      String(p.email).toLowerCase() === String(user.email).toLowerCase()
  );
  if (byEmail) return byEmail.full_name.trim();

  return data?.find((p) => p.full_name?.trim())?.full_name?.trim() || "";
}

export function FuelOrderEmailDialog({ open, onOpenChange, order, unifiedLabel, unifiedCnpjs, onStatusChanged }: Props) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    (async () => {
      let email: string | undefined;

      if (order.supplier_id) {
        const { data } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", order.supplier_id)
          .maybeSingle();
        email = (data as any)?.email?.trim().toLowerCase();
      }

      if (!email && order.supplier_name) {
        const { data } = await supabase
          .from("profiles")
          .select("email")
          .ilike("full_name", `%${order.supplier_name}%`)
          .not("email", "is", null)
          .limit(1);
        email = (data?.[0] as any)?.email?.trim().toLowerCase();
      }

      if (email) setTo(email);
    })();
  }, [open, order?.supplier_id, order?.supplier_name]);

  const handleSend = async () => {
    if (!to) {
      toast({ title: "Informe o destinatário", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const sessionRequesterName = await resolveSessionRequesterName();

      // Buscar assinatura do solicitante e fazer upload para Storage
      let signatureUrl: string | null = null;
      if (order.requester_user_id) {
        const { data: sigData } = await supabase
          .from("profiles")
          .select("signature_data")
          .eq("user_id", order.requester_user_id)
          .maybeSingle();
        const base64Data = (sigData as any)?.signature_data as string | null;

        if (base64Data?.startsWith("data:image/")) {
          try {
            const res = await fetch(base64Data);
            const blob = await res.blob();
            const filePath = `signatures/${order.requester_user_id}.png`;

            await supabase.storage
              .from("fuel-order-pdfs")
              .upload(filePath, blob, { upsert: true, contentType: "image/png" });

            const { data: urlData } = await supabase.storage
              .from("fuel-order-pdfs")
              .createSignedUrl(filePath, 60 * 60 * 24 * 365);

            signatureUrl = urlData?.signedUrl || null;
          } catch {
            // Falha no upload — continua sem assinatura no e-mail
          }
        }
      }

      // Gerar HTML do corpo do e-mail com assinatura (URL pública)
      const html = exportFuelOrderPDF(
        {
          ...order,
          requester_name: sessionRequesterName || order.requester_name,
        },
        unifiedLabel,
        unifiedCnpjs,
        signatureUrl
      );

      // Enviar e-mail
      const emailBody: Record<string, any> = {
        to,
        cc: cc || undefined,
        subject: `Ordem de Abastecimento Nº ${order.order_number} — SIME Transportes`,
        html,
      };

      const { data, error } = await supabase.functions.invoke("send-smtp-email", {
        body: emailBody,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update status to "enviada" on first send
      if (order.status === "pendente") {
        await supabase
          .from("fuel_orders")
          .update({ status: "enviada" } as any)
          .eq("id", order.id);
        onStatusChanged?.(order.id, "enviada");
      }

      toast({
        title: "E-mail enviado!",
        description: `Ordem #${order.order_number} enviada para ${to}.`,
      });
      onOpenChange(false);
      setTo("");
      setCc("");
    } catch (err: any) {
      toast({
        title: "Erro ao enviar e-mail",
        description: err.message || "Verifique as configurações SMTP em Configurações > E-mail",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Ordem por E-mail</DialogTitle>
          <DialogDescription>
            Ordem #{order?.order_number} — O PDF será enviado como corpo do e-mail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Destinatário *</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value.toLowerCase())}
              placeholder="fornecedor@email.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CC (opcional)</Label>
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value.toLowerCase())}
              placeholder="copia@email.com"
            />
          </div>

          <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Enviar E-mail"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
