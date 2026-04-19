import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, MinusCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createDescontoFolha,
  deleteDescontoFolha,
  fetchDescontosPendentesForMonth,
  type ColaboradorRH,
  type DescontoFolha,
  type DescontoFolhaTipo,
} from "@/services/rh";
import { MonthPicker } from "@/components/MonthPicker";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const TIPOS: { v: DescontoFolhaTipo; label: string }[] = [
  { v: "inss", label: "INSS" },
  { v: "irrf", label: "IRRF" },
  { v: "faltas", label: "Faltas" },
  { v: "multas", label: "Multas" },
  { v: "vale", label: "Vale" },
  { v: "adiantamento", label: "Adiantamento" },
  { v: "outros", label: "Outros" },
];

interface DescontosTabProps {
  colaboradores: ColaboradorRH[];
}

export function DescontosTab({ colaboradores }: DescontosTabProps) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [items, setItems] = useState<DescontoFolha[]>([]);
  const [loading, setLoading] = useState(false);
  const [colabId, setColabId] = useState("");
  const [tipo, setTipo] = useState<DescontoFolhaTipo>("outros");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const ativos = useMemo(() => colaboradores.filter((c) => c.ativo), [colaboradores]);
  const colabName = (id: string) =>
    ativos.find((c) => c.id === id)?.full_name || colaboradores.find((c) => c.id === id)?.full_name || "—";

  const load = async () => {
    setLoading(true);
    try {
      const ids = ativos.map((c) => c.id);
      const data = await fetchDescontosPendentesForMonth(ids, month);
      setItems(data);
    } catch (e: any) {
      toast.error("Erro ao carregar descontos: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ativos.length > 0) load();
    else setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, ativos.length]);

  const handleAdd = async () => {
    if (!colabId) return toast.error("Selecione um colaborador");
    const n = parseFloat(valor.replace(",", "."));
    if (isNaN(n) || n <= 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      const [y, m] = month.split("-").map(Number);
      await createDescontoFolha({
        colaborador_id: colabId,
        tipo,
        valor: n,
        descricao: descricao || null,
        data_referencia: new Date(y, m - 1, 1).toISOString().slice(0, 10),
      });
      toast.success("Desconto adicionado");
      setValor("");
      setDescricao("");
      await load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: DescontoFolha) => {
    const ok = await confirm({
      title: "Remover desconto?",
      description: `${colabName(d.colaborador_id)} — ${formatBRL(Number(d.valor))}`,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    try {
      await deleteDescontoFolha(d.id);
      toast.success("Desconto removido");
      await load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const total = items.reduce((s, i) => s + Number(i.valor || 0), 0);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MinusCircle className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-semibold">Descontos pendentes</h3>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mês</Label>
            <MonthPicker value={month} onChange={setMonth} className="w-[160px]" />
          </div>
        </div>

        <div className="rounded-md border border-border p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-muted/20">
          <div className="md:col-span-4 space-y-1">
            <Label className="text-xs">Colaborador</Label>
            <Select value={colabId} onValueChange={setColabId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ativos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as DescontoFolhaTipo)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="h-9" placeholder="0,00" />
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-9" placeholder="Opcional" />
          </div>
          <div className="md:col-span-1">
            <Button onClick={handleAdd} disabled={saving} className="h-9 w-full gap-1">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{items.length} desconto(s) pendente(s)</span>
          <span className="font-semibold text-foreground">Total: {formatBRL(total)}</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum desconto pendente para este mês.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {items.map((d) => (
              <Card key={d.id} className="hover:shadow-sm transition-shadow border-rose-200/60">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate flex-1 min-w-0">
                      {colabName(d.colaborador_id)}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                      {TIPOS.find((t) => t.v === d.tipo)?.label || d.tipo}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {d.descricao || "Sem descrição"}
                  </p>
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(d.data_referencia).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-rose-600 text-sm">
                        - {formatBRL(Number(d.valor))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => handleDelete(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Descontos pendentes serão automaticamente abatidos do líquido na geração da folha do mês correspondente.
        </p>
      </CardContent>
      {ConfirmDialog}
    </Card>
  );
}
