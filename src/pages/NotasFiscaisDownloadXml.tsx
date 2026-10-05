import { useState } from "react";
import JSZip from "jszip";
import { Download } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EmpresaFilter } from "@/components/financial/EmpresaControls";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { fetchCtesRecebidas, fetchCteRecebidoXml } from "@/lib/nfeRecebidas";

const OPCOES = [
  { value: "nfe_propria", label: "NF-e emissão própria" },
  { value: "cte_propria", label: "CT-e emissão própria" },
  { value: "mdfe_propria", label: "MDF-e emissão própria" },
  { value: "cte_recebidos", label: "Repositório CT-e - Conhecimentos Recebidos" },
  { value: "nfe_recebidas", label: "Repositório NF-e - Notas Recebidas" },
] as const;
type Opcao = (typeof OPCOES)[number]["value"];

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const firstDay = () => `${today().slice(0, 8)}01`;

export default function NotasFiscaisDownloadXml() {
  const { toast } = useToast();
  const { establishments } = useUnifiedCompany() as any;
  const [doc, setDoc] = useState<Opcao>("cte_propria");
  const [inicio, setInicio] = useState(firstDay());
  const [fim, setFim] = useState(today());
  const [empresa, setEmpresa] = useState("");
  const [busy, setBusy] = useState(false);

  const gerar = async () => {
    if (!inicio || !fim) { toast({ title: "Informe a data de emissão", variant: "destructive" }); return; }
    if (doc === "nfe_propria") { toast({ title: "Sem registros", description: "O sistema ainda não emite NF-e, então não há XMLs de NF-e própria." }); return; }
    setBusy(true);
    try {
      const zip = new JSZip();
      const from = `${inicio}T00:00:00-03:00`, to = `${fim}T23:59:59-03:00`;
      if (doc === "cte_propria" || doc === "mdfe_propria") {
        const table = doc === "cte_propria" ? "ctes" : "mdfe";
        let q = supabase.from(table as any).select("numero, chave_acesso, xml_autorizado").not("xml_autorizado", "is", null).gte("data_emissao", from).lte("data_emissao", to);
        if (empresa) q = q.eq("establishment_id", empresa);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const r of (data as any[]) || []) zip.file(`${r.chave_acesso || r.numero}.xml`, r.xml_autorizado);
      } else if (doc === "nfe_recebidas") {
        let q = supabase.from("nfes_recebidas" as any).select("chave, xml").not("xml", "is", null).gte("data_emissao", from).lte("data_emissao", to);
        if (empresa) q = q.eq("establishment_id", empresa);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const r of (data as any[]) || []) zip.file(`${r.chave}-nfe.xml`, r.xml);
      } else {
        const ests = (establishments || []).filter((e: any) => !empresa || e.id === empresa);
        for (const est of ests) {
          const list = await fetchCtesRecebidas(est.cnpj);
          for (const c of list) {
            const dt = String(c.data_emissao || "").slice(0, 10);
            const chave = String(c.chave_cte || c.chave || "").replace(/\D/g, "");
            if (!chave || dt < inicio || dt > fim) continue;
            try { const xml = await fetchCteRecebidoXml(chave, est.cnpj); if (xml) zip.file(`${chave}-cte.xml`, xml); } catch { /* indisponível */ }
          }
        }
      }
      const count = Object.keys(zip.files).length;
      if (!count) { toast({ title: "Sem registros", description: "Nenhum XML encontrado para o período escolhido." }); return; }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `xml-${doc}-${inicio}_${fim}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast({ title: "Download pronto", description: `${count} arquivo(s) XML.` });
    } catch (e: any) {
      toast({ title: "Falha ao gerar arquivos", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const actions: ToolbarAction[] = [{ key: "download", label: "Baixar XMLs (ZIP)", icon: Download, onClick: gerar, mode: "always" }];

  return (
    <AdminLayout>
      <PageTitle>Download de XML</PageTitle>
      <div className="container mx-auto px-4 py-3 md:px-6 space-y-3">
        <GlobalToolbar actions={actions} selectedCount={0} />
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-[140px_1fr] sm:items-start text-xs">
            <Label className="pt-1 text-xs">Documentos *</Label>
            <RadioGroup value={doc} onValueChange={(v) => setDoc(v as Opcao)} className="gap-2">
              {OPCOES.map((o) => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value={o.value} /> <span>{o.label}</span>
                </label>
              ))}
            </RadioGroup>
            <Label className="pt-2 text-xs">Data emissão</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="h-8 w-[150px] text-xs" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <span className="text-muted-foreground">até</span>
              <Input type="date" className="h-8 w-[150px] text-xs" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <Label className="pt-2 text-xs">Empresa</Label>
            <div><EmpresaFilter value={empresa} onChange={setEmpresa} /></div>
          </CardContent>
        </Card>
      </div>
      <ProcessingOverlay open={busy} label="Gerando arquivos XML..." />
    </AdminLayout>
  );
}
