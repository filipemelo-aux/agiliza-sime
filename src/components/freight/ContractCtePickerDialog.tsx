import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterField } from "@/components/ui/search-filter-card";
import { EmpresaFilter } from "@/components/financial/EmpresaControls";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { matchesText } from "@/lib/search";
import type { Cte } from "@/pages/FreightCte";

/** Status em que o CT-e não é considerado ativo para contratação. */
export const INACTIVE_CTE_STATUSES = ["cancelado", "denegado", "inutilizado"];

const CTE_PICKER_COLUMNS =
  "id,numero,numero_interno,serie,tipo_talao,status,data_emissao,remetente_nome,destinatario_nome,tomador_nome,placa_veiculo,valor_frete,establishment_id";

/** Número exibido/busca: serviço usa o número interno, produção usa o número fiscal. */
const cteNumero = (r: any) => (r.tipo_talao === "servico" ? r.numero_interno : r.numero);

const talaoLabel = (r: any) => (r.tipo_talao === "servico" ? "Serviço" : "Produção");

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (cte: Cte) => void;
}

export function ContractCtePickerDialog({ open, onOpenChange, onPick }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [talao, setTalao] = useState("todos");
  const [empresa, setEmpresa] = useState("");

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTalao("todos");
    setEmpresa("");
    (async () => {
      setLoading(true);
      const [{ data: ctes }, { data: contracts }] = await Promise.all([
        supabase.from("ctes")
          .select(CTE_PICKER_COLUMNS)
          .not("status", "in", `(${INACTIVE_CTE_STATUSES.join(",")})`)
          .order("data_emissao", { ascending: false })
          .limit(1000),
        supabase.from("freight_contracts").select("cte_id"),
      ]);
      const used = new Set((contracts || []).map((c: any) => c.cte_id));
      setRows((ctes || []).filter((c: any) => !used.has(c.id)));
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (talao !== "todos" && r.tipo_talao !== talao) return false;
    if (empresa && r.establishment_id !== empresa) return false;
    const term = q.trim();
    if (!term) return true;
    return matchesText(String(cteNumero(r) ?? ""), term);
  }), [rows, q, talao, empresa]);

  const pick = async (id: string) => {
    const { data } = await supabase.from("ctes").select("*").eq("id", id).maybeSingle();
    if (data) onPick(data as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Novo contrato de frete — selecione o CT-e</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">O contrato precisa estar vinculado a um CT-e ativo (produção ou serviço) que ainda não tenha contrato.</p>

        <div className="flex min-w-0 flex-wrap items-end gap-2 [&_input]:h-8 [&_[role=combobox]]:h-8">
          <FilterField label="Nº do CT-e" className="min-w-[180px] flex-1">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input autoFocus className="pl-8 h-8 text-xs" placeholder="Somente o número" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </FilterField>
          <FilterField label="Talão" className="shrink-0">
            <Select value={talao} onValueChange={setTalao}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-[60]">
                <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                <SelectItem value="producao" className="text-xs">Produção</SelectItem>
                <SelectItem value="servico" className="text-xs">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Empresa" className="shrink-0">
            <EmpresaFilter value={empresa} onChange={setEmpresa} />
          </FilterField>
        </div>

        <div className="max-h-[55vh] overflow-auto border rounded-md divide-y">
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Nenhum CT-e ativo sem contrato.</div>
          ) : filtered.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r.id)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 text-xs grid grid-cols-[70px_80px_80px_1fr_80px_100px] gap-2 items-center">
              <span className="font-mono">{cteNumero(r) ?? "—"}</span>
              <span className="uppercase text-muted-foreground">{talaoLabel(r)}</span>
              <span className="tabular-nums">{r.data_emissao ? formatDateBR(r.data_emissao) : "—"}</span>
              <span className="truncate">{r.tomador_nome || r.remetente_nome || "—"} → {r.destinatario_nome || "—"}</span>
              <span>{r.placa_veiculo || "—"}</span>
              <span className="text-right tabular-nums">{formatCurrency(Number(r.valor_frete) || 0)}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
