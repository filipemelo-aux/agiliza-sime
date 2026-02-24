import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Loader2, Plus, Building2, Pencil } from "lucide-react";
import { maskCNPJ, unmaskCNPJ, maskCEP, unmaskCEP, maskName, maskOnlyNumbers } from "@/lib/masks";
import { useCepLookup } from "@/hooks/useCepLookup";
import { FiscalEstablishmentForm } from "@/components/FiscalEstablishmentForm";
import type { Tables } from "@/integrations/supabase/types";

type Establishment = Tables<"fiscal_establishments">;

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function FreightFiscalSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Establishments
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEst, setEditingEst] = useState<Establishment | null>(null);

  const [form, setForm] = useState({
    cnpj: "",
    inscricao_estadual: "",
    razao_social: "",
    nome_fantasia: "",
    regime_tributario: "lucro_real",
    serie_cte: 1,
    serie_mdfe: 1,
    ultimo_numero_cte: 0,
    ultimo_numero_mdfe: 0,
    uf_emissao: "SP",
    codigo_municipio_ibge: "",
    endereco_logradouro: "",
    endereco_numero: "",
    endereco_bairro: "",
    endereco_municipio: "",
    endereco_uf: "SP",
    endereco_cep: "",
    ambiente: "homologacao",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, estRes] = await Promise.all([
        supabase.from("fiscal_settings").select("*").limit(1).maybeSingle(),
        supabase.from("fiscal_establishments").select("*").order("type", { ascending: true }).order("razao_social"),
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (settingsRes.data) {
        const data = settingsRes.data;
        setSettingsId(data.id);
        setForm({
          cnpj: data.cnpj ? maskCNPJ(data.cnpj) : "",
          inscricao_estadual: data.inscricao_estadual || "",
          razao_social: data.razao_social || "",
          nome_fantasia: data.nome_fantasia || "",
          regime_tributario: data.regime_tributario || "lucro_real",
          serie_cte: data.serie_cte || 1,
          serie_mdfe: data.serie_mdfe || 1,
          ultimo_numero_cte: data.ultimo_numero_cte || 0,
          ultimo_numero_mdfe: data.ultimo_numero_mdfe || 0,
          uf_emissao: data.uf_emissao || "SP",
          codigo_municipio_ibge: data.codigo_municipio_ibge || "",
          endereco_logradouro: data.endereco_logradouro || "",
          endereco_numero: data.endereco_numero || "",
          endereco_bairro: data.endereco_bairro || "",
          endereco_municipio: data.endereco_municipio || "",
          endereco_uf: data.endereco_uf || "SP",
          endereco_cep: data.endereco_cep ? maskCEP(data.endereco_cep) : "",
          ambiente: data.ambiente || "homologacao",
        });
      }

      if (!estRes.error && estRes.data) {
        setEstablishments(estRes.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { ...form, cnpj: unmaskCNPJ(form.cnpj) || form.cnpj, endereco_cep: unmaskCEP(form.endereco_cep) || form.endereco_cep, user_id: user.id };
      if (settingsId) {
        const { error } = await supabase.from("fiscal_settings").update(payload).eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("fiscal_settings").insert(payload).select("id").single();
        if (error) throw error;
        setSettingsId(data.id);
      }
      toast({ title: "Salvo", description: "Configurações fiscais atualizadas." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const { lookupCep, loading: cepLoading, error: cepError } = useCepLookup(
    useCallback((data) => {
      setForm((p) => ({
        ...p,
        endereco_logradouro: data.street || p.endereco_logradouro,
        endereco_bairro: data.neighborhood || p.endereco_bairro,
        endereco_municipio: data.city || p.endereco_municipio,
        endereco_uf: data.state || p.endereco_uf,
        endereco_cep: data.cep || p.endereco_cep,
      }));
    }, [])
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="h-8 bg-muted rounded w-64 animate-pulse mb-6" />
          <div className="h-96 bg-muted rounded animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <BackButton to="/admin/services" label="Serviços" />
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold font-display">Configurações Fiscais</h1>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Estabelecimentos */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Estabelecimentos (Matriz e Filiais)
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
                <p className="text-sm text-muted-foreground">Nenhum estabelecimento cadastrado. Crie a Matriz e suas Filiais.</p>
              ) : (
                <div className="space-y-3">
                  {establishments.map((est) => (
                    <div
                      key={est.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={est.type === "matriz" ? "default" : "secondary"} className="text-[10px] uppercase">
                            {est.type}
                          </Badge>
                          {!est.active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                        </div>
                        <p className="font-medium text-sm truncate">{est.razao_social}</p>
                        <p className="text-xs text-muted-foreground">
                          CNPJ: {maskCNPJ(est.cnpj)} · Série CT-e: {est.serie_cte} · Último nº: {est.ultimo_numero_cte}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingEst(est); setFormOpen(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dados da empresa (fiscal_settings global) */}
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="font-display">Configurações Globais (Certificado)</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ Principal</Label>
                <Input value={form.cnpj} onChange={(e) => set("cnpj", maskCNPJ(e.target.value))} maxLength={18} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", maskOnlyNumbers(e.target.value))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Razão Social</Label>
                <Input value={form.razao_social} onChange={(e) => set("razao_social", maskName(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Regime Tributário</Label>
                <Select value={form.regime_tributario} onValueChange={(v) => set("regime_tributario", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>UF Emissão</Label>
                <Select value={form.uf_emissao} onValueChange={(v) => set("uf_emissao", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FiscalEstablishmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        establishment={editingEst}
        onSaved={fetchAll}
      />
    </AdminLayout>
  );
}
