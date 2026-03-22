import { useState } from "react";
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
  establishments: any[];
}

export function FuelOrderEmailDialog({ open, onOpenChange, order, establishments }: Props) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to) {
      toast({ title: "Informe o destinatário", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const html = exportFuelOrderPDF(order, establishments);

      const { data, error } = await supabase.functions.invoke("send-smtp-email", {
        body: {
          to,
          cc: cc || undefined,
          subject: `Ordem de Abastecimento Nº ${order.order_number} — SIME Transportes`,
          html,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "E-mail enviado!", description: `Ordem #${order.order_number} enviada para ${to}` });
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
          <div className="space-y-2">
            <Label>Destinatário *</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="fornecedor@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label>CC (opcional)</Label>
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
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
