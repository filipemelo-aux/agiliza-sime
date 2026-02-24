import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CertificateUploadDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome || !senha || !file) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".pfx") && !fileName.endsWith(".p12")) {
      toast({ title: "Apenas arquivos .pfx ou .p12", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo excede 10MB", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Send file + password to edge function (never stored in frontend)
      const formData = new FormData();
      formData.append("nome", nome);
      formData.append("senha", senha);
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("certificate-manager", {
        body: formData,
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || "Erro ao salvar certificado");

      toast({ title: "Certificado salvo com segurança", description: "Senha criptografada no servidor." });
      setNome("");
      setSenha("");
      setFile(null);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Upload Certificado A1
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              🔒 O certificado e a senha são enviados diretamente ao servidor e criptografados. 
              Nenhum dado sensível é armazenado no navegador.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do Certificado *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Certificado Matriz 2026" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Arquivo .pfx *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".pfx,.p12"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
              <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Senha do Certificado *</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do .pfx" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</> : "Salvar com Segurança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
