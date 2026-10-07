import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { matchesText } from "@/lib/search";
import type { Cte } from "@/pages/FreightCte";

/** Status em que o CT-e não é considerado ativo para contratação. */
export const INACTIVE_CTE_STATUSES = ["cancelado", "denegado", "inutilizado"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (cte: Cte) => void;
}

export function ContractCtePickerDialog({ open, onOpenChange, onPick }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setQ("");
    (async () => {
      setLoading(true);
      const [{ data: ctes }, { data: contracts }] = await Promise.all([
        supabase.from("ctes")
          .select("id,numero,serie,tipo_talao,status,data_emissao,remetente_nome,destinatario_nome,tomador_nome,placa_veiculo,valor_frete")
          .not("status", "in", `(${INACTIVE_CTE_STATUSES.join(",")})`)
          .order("data_emissao", { ascending: false })
          .limit(500),
        supabase.from("freight_contracts").select("cte_id"),
      ]);
      const used = new Set((contracts || []).map((c: any) => c.cte_id));
      setRows((ctes || []).filter((c: any) => !used.has(c.id)));
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => rows.filter((r) =>
    !q.trim() || matchesText([r.numero, r.remetente_nome, r.destinatario_nome, r.tomador_nome, r.placa_veiculo].filter(Boolean).join(" "), q)
  ), [rows, q]);

  const pick = async (id: string) => {
    const { data } = await supabase.from("ctes").select("*").eq("id", id).maybeSingle();
    if (data) onPick(data as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Novo contrato de frete — selecione o CT-e</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">O contrato precisa estar vinculado a um CT-e ativo (produção ou serviço) que ainda não tenha contrato.</p>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-8 h-9" placeholder="Nº, cliente, placa..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[55vh] overflow-auto border rounded-md divide-y">
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Nenhum CT-e ativo sem contrato.</div>
          ) : filtered.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r.id)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 text-xs grid grid-cols-[70px_70px_80px_1fr_80px_100px] gap-2 items-center">
              <span className="font-mono">{r.numero ?? "—"}</span>
              <span className="uppercase text-muted-foreground">{r.tipo_talao === "servico" ? "Serviço" : "Produção"}</span>
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
