import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Copy, Search, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Cte } from "@/pages/FreightCte";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctes: Cte[];
  onCreated?: () => void;
}

// Campos que NÃO são clonados (cada CT-e novo recebe os seus próprios)
const CAMPOS_EXCLUIDOS = new Set([
  "id",
  "numero",
  "chave_acesso",
  "protocolo_autorizacao",
  "status",
  "xml_enviado",
  "xml_autorizado",
  "motivo_rejeicao",
  "data_autorizacao",
  "created_at",
  "updated_at",
  "created_by",
  "numero_interno",
  // data_emissao é sobrescrita pelo input do usuário
  "data_emissao",
  // Veículo, motorista e peso são específicos de cada viagem — não copiar
  "placa_veiculo",
  "veiculo_id",
  "motorista_id",
  "motorista_nome",
  "rntrc",
  "peso_bruto",
  "info_quantidade",
]);

export function CteBatchDialog({ open, onOpenChange, ctes, onCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [dataEmissao, setDataEmissao] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch("");
      setBaseId(null);
      setQuantidade(1);
      setDataEmissao(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  // Apenas CT-es de produção podem ser usados como modelo (talão de serviço tem sua própria lógica)
  const candidatos = useMemo(() => {
    const lista = ctes.filter((c) => c.tipo_talao !== "servico");
    const q = search.toLowerCase().trim();
    if (!q) return lista.slice(0, 30);
    return lista
      .filter(
        (c) =>
          String(c.numero || "").includes(q) ||
          c.remetente_nome?.toLowerCase().includes(q) ||
          c.destinatario_nome?.toLowerCase().includes(q) ||
          c.produto_predominante?.toLowerCase?.().includes(q)
      )
      .slice(0, 30);
  }, [ctes, search]);

  const baseCte = useMemo(() => ctes.find((c) => c.id === baseId) || null, [ctes, baseId]);

  const handleCreate = async () => {
    if (!baseCte) {
      toast({ title: "Selecione o CT-e modelo", variant: "destructive" });
      return;
    }
    if (!quantidade || quantidade < 1 || quantidade > 50) {
      toast({
        title: "Quantidade inválida",
        description: "Informe entre 1 e 50 novos CT-es.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Buscar registro completo do CT-e modelo (o objeto em memória pode estar resumido)
      const { data: full, error: fetchErr } = await supabase
        .from("ctes")
        .select("*")
        .eq("id", baseCte.id)
        .single();
      if (fetchErr) throw fetchErr;

      const dataEmissaoIso = new Date(dataEmissao + "T12:00:00").toISOString();

      const novoBase: Record<string, any> = {};
      for (const [k, v] of Object.entries(full as any)) {
        if (CAMPOS_EXCLUIDOS.has(k)) continue;
        novoBase[k] = v;
      }
      novoBase.status = "rascunho";
      novoBase.data_emissao = dataEmissaoIso;
      novoBase.created_by = user?.id;

      const linhas = Array.from({ length: quantidade }, () => ({ ...novoBase }));
      const { error } = await supabase.from("ctes").insert(linhas as any);
      if (error) throw error;

      toast({
        title: "CT-es criados em lote",
        description: `${quantidade} novo(s) CT-e(s) gerado(s) como rascunho a partir do Nº ${baseCte.numero}. Edite cada um antes de transmitir.`,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao criar lote", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Copy className="w-5 h-5" /> Emissão de CT-e em Lote
          </DialogTitle>
          <DialogDescription>
            Selecione um CT-e modelo. Os novos CT-es serão criados como{" "}
            <b>rascunho</b>, copiando atores (remetente, destinatário, expedidor,
            recebedor), natureza da carga, modal e tomador. Você ainda poderá editar
            cada um antes de transmitir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca CT-e modelo */}
          <div className="space-y-2">
            <Label className="text-xs">Buscar CT-e modelo</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Número, remetente, destinatário, produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Lista de candidatos */}
          <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
            {candidatos.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum CT-e de produção encontrado.
              </div>
            ) : (
              candidatos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBaseId(c.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                    baseId === c.id ? "bg-primary/10" : ""
                  }`}
                >
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {c.numero ? `Nº ${c.numero}` : "Sem número"} ·{" "}
                      {c.remetente_nome} → {c.destinatario_nome}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.produto_predominante || c.natureza_operacao} ·{" "}
                      {c.uf_origem} → {c.uf_destino}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Configuração do lote */}
          {baseCte && (
            <Card className="border-primary/30">
              <CardContent className="pt-4 space-y-3">
                <div className="text-xs text-muted-foreground">
                  Modelo selecionado:{" "}
                  <b className="text-foreground">
                    Nº {baseCte.numero} · {baseCte.remetente_nome} →{" "}
                    {baseCte.destinatario_nome}
                  </b>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data de emissão</Label>
                    <Input
                      type="date"
                      value={dataEmissao}
                      onChange={(e) => setDataEmissao(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Quantidade (1 a 50)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={quantidade}
                      onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !baseCte}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Criando...
                </>
              ) : (
                <>Criar {quantidade} CT-e(s)</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
