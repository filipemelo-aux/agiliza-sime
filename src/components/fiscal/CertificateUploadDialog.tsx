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
import { Upload, Loader2 } from "lucide-react";

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

    setSaving(true);
    try {
      const filePath = `certificates/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("fiscal-certificates")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("fiscal_certificates").insert({
        nome,
        caminho_storage: filePath,
        senha_criptografada: senha, // In production, encrypt before storing
      });
      if (error) throw error;

      toast({ title: "Certificado salvo com sucesso" });
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
          <DialogTitle className="font-display">Upload Certificado A1</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando...</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
