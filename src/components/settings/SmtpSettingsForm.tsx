import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Send, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface SmtpForm {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

const DEFAULT_FORM: SmtpForm = {
  host: "",
  port: 587,
  username: "",
  password: "",
  from_email: "",
  from_name: "",
  use_tls: true,
};

export function SmtpSettingsForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<SmtpForm>(DEFAULT_FORM);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("smtp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setExistingId(data.id);
        setHasPassword(!!data.password_encrypted);
        setForm({
          host: data.host || "",
          port: data.port || 587,
          username: data.username || "",
          password: "", // never show stored password
          from_email: data.from_email || "",
          from_name: data.from_name || "",
          use_tls: data.use_tls ?? true,
        });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.host || !form.username || !form.from_email) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (!existingId && !form.password) {
      toast({ title: "Senha SMTP é obrigatória", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        host: form.host,
        port: form.port,
        username: form.username,
        from_email: form.from_email,
        from_name: form.from_name,
        use_tls: form.use_tls,
        updated_at: new Date().toISOString(),
      };

      // Only send password if user typed a new one
      if (form.password) {
        payload.password_encrypted = form.password; // Edge function will handle actual encryption
      }

      if (existingId) {
        const { error } = await supabase
          .from("smtp_settings")
          .update(payload)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        payload.created_by = user!.id;
        payload.password_encrypted = form.password;
        const { data, error } = await (supabase as any)
          .from("smtp_settings")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setExistingId(data.id);
      }

      setHasPassword(true);
      toast({ title: "Configurações SMTP salvas!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast({ title: "Informe um e-mail de teste", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-smtp-email", {
        body: {
          to: testEmail,
          subject: "Teste SMTP — SIME Transportes",
          html: `<h2>Teste de Configuração SMTP</h2><p>Se você está lendo este e-mail, a configuração SMTP do SIME Transportes está funcionando corretamente.</p><p><small>Enviado em ${new Date().toLocaleString("pt-BR")}</small></p>`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "E-mail de teste enviado!",
        description: `Verifique a caixa de entrada de ${testEmail}`,
      });
    } catch (err: any) {
      toast({ title: "Falha no envio", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servidor SMTP</CardTitle>
          <CardDescription>Configure o servidor de e-mail para envio de documentos pelo sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Host SMTP *</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Porta *</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value) || 587 }))}
                placeholder="587"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Usuário / E-mail *</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Senha {hasPassword && !form.password && <Badge variant="outline" className="text-xs ml-2">Salva</Badge>}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={hasPassword ? "Deixe vazio para manter" : "Senha SMTP"}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail Remetente *</Label>
              <Input
                type="email"
                value={form.from_email}
                onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
                placeholder="noreply@suaempresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome Remetente</Label>
              <Input
                value={form.from_name}
                onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))}
                placeholder="SIME Transportes"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.use_tls}
              onCheckedChange={(v) => setForm((f) => ({ ...f, use_tls: v }))}
            />
            <Label>Usar TLS/STARTTLS</Label>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>

      {/* Test Section */}
      {existingId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Testar Envio</CardTitle>
            <CardDescription>Envie um e-mail de teste para verificar se a configuração está correta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="destinatario@email.com"
                className="flex-1"
              />
              <Button onClick={handleTest} disabled={testing} variant="outline" className="gap-2 shrink-0">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Testar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
