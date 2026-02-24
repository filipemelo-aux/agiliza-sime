import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Save } from "lucide-react";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function FreightFiscalSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

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
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("fiscal_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSettingsId(data.id);
        setForm({
          cnpj: data.cnpj || "",
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
          endereco_cep: data.endereco_cep || "",
          ambiente: data.ambiente || "homologacao",
        });
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
      const payload = { ...form, user_id: user.id };
      if (settingsId) {
        const { error } = await supabase
          .from("fiscal_settings")
          .update(payload)
          .eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("fiscal_settings")
          .insert(payload)
          .select("id")
          .single();
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
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <BackButton to="/admin/services" label="Serviços" />
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold font-display">Configurações Fiscais</h1>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Dados da empresa */}
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="font-display">Dados da Empresa</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Razão Social</Label>
                <Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} />
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
                  <SelectContent>
                    {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select value={form.ambiente} onValueChange={(v) => set("ambiente", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cód. Município IBGE</Label>
                <Input value={form.codigo_municipio_ibge} onChange={(e) => set("codigo_municipio_ibge", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="font-display">Endereço</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Logradouro</Label>
                <Input value={form.endereco_logradouro} onChange={(e) => set("endereco_logradouro", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input value={form.endereco_numero} onChange={(e) => set("endereco_numero", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.endereco_bairro} onChange={(e) => set("endereco_bairro", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Município</Label>
                <Input value={form.endereco_municipio} onChange={(e) => set("endereco_municipio", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Select value={form.endereco_uf} onValueChange={(v) => set("endereco_uf", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={form.endereco_cep} onChange={(e) => set("endereco_cep", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Séries e Numeração */}
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="font-display">Séries e Numeração</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Série CT-e</Label>
                <Input type="number" value={form.serie_cte} onChange={(e) => set("serie_cte", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Último Nº CT-e</Label>
                <Input type="number" value={form.ultimo_numero_cte} onChange={(e) => set("ultimo_numero_cte", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Série MDF-e</Label>
                <Input type="number" value={form.serie_mdfe} onChange={(e) => set("serie_mdfe", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Último Nº MDF-e</Label>
                <Input type="number" value={form.ultimo_numero_mdfe} onChange={(e) => set("ultimo_numero_mdfe", Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
