import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { maskCNPJ } from "@/lib/masks";
import { FiscalEstablishmentForm } from "@/components/FiscalEstablishmentForm";
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

type Establishment = Tables<"fiscal_establishments">;

interface Certificate {
  id: string;
  nome: string;
  ativo: boolean;
}

interface EstablishmentWithCert extends Establishment {
  certificates: Certificate[];
}

export function EstablishmentsList() {
  const { toast } = useToast();
  const [establishments, setEstablishments] = useState<EstablishmentWithCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEst, setEditingEst] = useState<Establishment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchEstablishments();
  }, []);

  const fetchEstablishments = async () => {
    setLoading(true);
    try {
      const { data: ests, error } = await supabase
        .from("fiscal_establishments")
        .select("*")
        .order("type", { ascending: true })
        .order("razao_social");
      if (error) throw error;

      // Fetch certificate links
      const { data: links } = await supabase
        .from("establishment_certificates")
        .select("establishment_id, certificate_id");

      const certIds = [...new Set((links || []).map((l) => l.certificate_id))];
      let certsMap: Record<string, Certificate> = {};
      if (certIds.length > 0) {
        const { data: certs } = await supabase
          .from("fiscal_certificates")
          .select("id, nome, ativo")
          .in("id", certIds);
        (certs || []).forEach((c) => { certsMap[c.id] = c; });
      }

      const enriched: EstablishmentWithCert[] = (ests || []).map((est) => {
        const estLinks = (links || []).filter((l) => l.establishment_id === est.id);
        return {
          ...est,
          certificates: estLinks.map((l) => certsMap[l.certificate_id]).filter(Boolean),
        };
      });

      setEstablishments(enriched);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("fiscal_establishments").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Estabelecimento removido" });
      fetchEstablishments();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
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
            <Building2 className="w-5 h-5" />
            Matriz e Filiais
          </CardTitle>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => { setEditingEst(null); setFormOpen(true); }}
          >
            <Plus className="w-4 h-4" /> Novo
          </Button>
        </CardHeader>
        <CardContent>
          {establishments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum estabelecimento cadastrado. Crie a Matriz e suas Filiais.
            </p>
          ) : (
            <div className="space-y-3">
              {establishments.map((est) => (
                <div
                  key={est.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={est.type === "matriz" ? "default" : "secondary"} className="text-[10px] uppercase">
                        {est.type}
                      </Badge>
                      {!est.active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                      {est.certificates.length > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          {est.certificates[0].nome}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm truncate">{est.razao_social}</p>
                    <p className="text-xs text-muted-foreground">
                      CNPJ: {maskCNPJ(est.cnpj)} · Série CT-e: {est.serie_cte} · Último nº: {est.ultimo_numero_cte}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingEst(est); setFormOpen(true); }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(est.id)}
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

      <FiscalEstablishmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        establishment={editingEst}
        onSaved={fetchEstablishments}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este estabelecimento? Esta ação não pode ser desfeita.
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
