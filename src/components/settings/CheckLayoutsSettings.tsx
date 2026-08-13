import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Save, Trash2, Eye, Download } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCheckPdf, downloadPdfBytes } from "@/lib/checkPdf";
import { CheckPdfPreview } from "@/components/financial/CheckPdfPreview";
import { getLocalDateISO } from "@/lib/date";

type Layout = Record<string, any>;

const FOLHA_FIELDS: { key: string; label: string }[] = [
  { key: "largura_folha_mm", label: "Largura da folha (mm)" },
  { key: "altura_folha_mm", label: "Altura da folha (mm)" },
  { key: "cruzamento_altura_mm", label: "Cruzamento — comprimento (mm)" },
  { key: "cruzamento_espaco_mm", label: "Cruzamento — espaço entre linhas (mm)" },
];

const COORD_GROUPS: { title: string; fields: { base: string; label: string }[] }[] = [
  {
    title: "Cheque",
    fields: [
      { base: "valor_numerico", label: "Valor numérico" },
      { base: "valor_extenso1", label: "Extenso — linha 1" },
      { base: "valor_extenso2", label: "Extenso — linha 2" },
      { base: "nominal", label: "Nominal (favorecido)" },
      { base: "cidade", label: "Cidade" },
      { base: "data", label: "Data" },
      { base: "bom_para", label: "Bom para (pré-datado)" },
      { base: "cruzamento", label: "Cruzamento (início das linhas)" },
    ],
  },
  {
    title: "Canhoto",
    fields: [
      { base: "canhoto_valor", label: "Valor" },
      { base: "canhoto_data", label: "Data" },
      { base: "canhoto_favorecido", label: "Favorecido (linha 1)" },
      { base: "canhoto_favorecido2", label: "Favorecido (linha 2)" },
      { base: "canhoto_referente", label: "Referente" },
      { base: "canhoto_bom_para", label: "Bom para (pré-datado)" },
    ],
  },
];

export function CheckLayoutsSettings() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<Layout | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [testOpen, setTestOpen] = useState(false);
  const [testBytes, setTestBytes] = useState<Uint8Array | null>(null);
  const [testing, setTesting] = useState(false);
  const [testCruzado, setTestCruzado] = useState(true);
  const [testCanhoto, setTestCanhoto] = useState(true);

  const load = async (keepId?: string) => {
    const { data, error } = await supabase.from("check_layouts").select("*").order("banco_nome");
    if (error) return toast.error("Erro ao carregar layouts", { description: error.message });
    const list = (data as any[]) || [];
    setLayouts(list);
    const id = keepId || selectedId || list[0]?.id || "";
    setSelectedId(id);
    setForm(list.find(l => l.id === id) || null);
  };

  useEffect(() => { load(); }, []);

  const selectLayout = (id: string) => {
    setSelectedId(id);
    setForm(layouts.find(l => l.id === id) || null);
  };

  const setField = (key: string, value: string) =>
    setForm(f => (f ? { ...f, [key]: value } : f));

  const handleNew = async () => {
    const { data, error } = await supabase
      .from("check_layouts")
      .insert({ banco_nome: "Novo banco" } as any)
      .select("*")
      .single();
    if (error) return toast.error("Erro ao criar layout", { description: error.message });
    await load((data as any).id);
    toast.success("Layout criado");
  };

  const handleSave = async () => {
    if (!form) return;
    if (!String(form.banco_nome || "").trim()) return toast.error("Informe o nome do banco");
    setSaving(true);
    const payload: any = { banco_nome: String(form.banco_nome).trim() };
    [...FOLHA_FIELDS.map(f => f.key),
     ...COORD_GROUPS.flatMap(g => g.fields.flatMap(f => [`${f.base}_x`, `${f.base}_y`]))]
      .forEach(k => { payload[k] = Number(form[k]) || 0; });

    const { error } = await supabase.from("check_layouts").update(payload).eq("id", form.id);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar", { description: error.message });
    toast.success("Layout salvo");
    load(form.id);
  };

  const handleTestPreview = async () => {
    if (!form) return;
    setTesting(true);
    try {
      const bytes = await buildCheckPdf({
        layout: form,
        valor: 1234.56,
        nominal: "TESTE DE ALINHAMENTO LTDA",
        historico: "",
        cidade: "Araguaína",
        dataISO: getLocalDateISO(),
        cruzado: testCruzado,
        imprimirCanhoto: testCanhoto,
        predatado: true,
        dataVencimentoISO: getLocalDateISO(),
      });
      setTestBytes(bytes);
      setTestOpen(true);
    } catch (e: any) {
      toast.error("Erro ao gerar teste", { description: e?.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!form) return;
    const ok = await confirm({
      title: "Excluir layout",
      description: `Remover o layout "${form.banco_nome}"?`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const { error } = await supabase.from("check_layouts").delete().eq("id", form.id);
    if (error) return toast.error("Erro ao excluir", { description: error.message });
    setSelectedId("");
    await load();
    toast.success("Layout excluído");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Layouts de Cheque</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ajuste fino do alinhamento da impressora. Todas as coordenadas são em milímetros, medidas a partir do canto
          superior esquerdo da folha.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px]">
            <Label className="text-xs">Template</Label>
            <Select value={selectedId} onValueChange={selectLayout}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {layouts.map(l => <SelectItem key={l.id} value={l.id}>{l.banco_nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" /> Novo banco
          </Button>
        </div>

        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Nome do banco</Label>
                <Input className="h-9" value={form.banco_nome || ""} onChange={e => setField("banco_nome", e.target.value)} />
              </div>
              {FOLHA_FIELDS.map(f => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input className="h-9" type="number" step="0.5" value={form[f.key] ?? ""} onChange={e => setField(f.key, e.target.value)} />
                </div>
              ))}
            </div>

            {COORD_GROUPS.map(group => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">{group.title}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.fields.map(f => (
                    <div key={f.base} className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        className="h-8 text-xs" type="number" step="0.5" placeholder="X"
                        value={form[`${f.base}_x`] ?? ""}
                        onChange={e => setField(`${f.base}_x`, e.target.value)}
                      />
                      <Input
                        className="h-8 text-xs" type="number" step="0.5" placeholder="Y"
                        value={form[`${f.base}_y`] ?? ""}
                        onChange={e => setField(`${f.base}_y`, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={testCruzado} onCheckedChange={v => setTestCruzado(!!v)} />
                Cruzar cheque no teste
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={testCanhoto} onCheckedChange={v => setTestCanhoto(!!v)} />
                Imprimir canhoto no teste
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTestPreview} disabled={testing}>
                <Eye className="h-4 w-4" /> {testing ? "Gerando..." : "Pré-visualizar teste"}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar layout"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Cheque de teste — {form?.banco_nome}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Valores fictícios apenas para conferir o alinhamento. Imprima em A4, escala 100% e margens “Nenhuma”.
          </p>
          <CheckPdfPreview bytes={testBytes} />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => testBytes && downloadPdfBytes(testBytes, "cheque_teste_layout.pdf")}
            >
              <Download className="h-4 w-4" /> Baixar PDF de teste
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </Card>
  );
}
