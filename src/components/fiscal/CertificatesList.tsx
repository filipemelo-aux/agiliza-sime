import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, ShieldCheck, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { CertificateUploadDialog } from "@/components/fiscal/CertificateUploadDialog";
import type { Tables } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Certificate = Tables<"fiscal_certificates">;

export function CertificatesList() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fiscal_certificates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCertificates(data || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (cert: Certificate) => {
    try {
      const { error } = await supabase
        .from("fiscal_certificates")
        .update({ ativo: !cert.ativo })
        .eq("id", cert.id);
      if (error) throw error;
      toast({ title: cert.ativo ? "Certificado desativado" : "Certificado ativado" });
      fetchCertificates();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      // Delete links first
      await supabase.from("establishment_certificates").delete().eq("certificate_id", deleteId);
      const { error } = await supabase.from("fiscal_certificates").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Certificado removido" });
      fetchCertificates();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Certificados Digitais A1
          </CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4" /> Upload
          </Button>
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum certificado cadastrado. Faça upload de um arquivo .pfx para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <p className="font-medium text-sm">{cert.nome}</p>
                      <Badge variant={cert.ativo ? "default" : "outline"} className="text-[10px]">
                        {cert.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Arquivo: {cert.caminho_storage.split("/").pop()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActive(cert)}
                      title={cert.ativo ? "Desativar" : "Ativar"}
                    >
                      {cert.ativo ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(cert.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CertificateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={fetchCertificates}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este certificado? Os vínculos com estabelecimentos também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
