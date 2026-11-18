import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { Valor } from "./DetranConsultaDialog";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { toast } from "@/lib/notice";
import { exportDetranDetalhesPdf } from "@/lib/fleet/detranDetalhesPdf";

type Consulta = { id: string; uf: string; created_at: string; price: string | null; response: unknown; importacao: any };

/** Detalhes gravados das consultas ao Detran — sem chamar a API novamente. */
export function DetranDetalhesDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: { id: string; plate: string } | null }) {
  const [lista, setLista] = useState<Consulta[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [gerando, setGerando] = useState(false);
  useEffect(() => {
    if (!open || !vehicle) return;
    setLista(null);
    supabase.from("vehicle_debt_consultas" as any).select("id, uf, created_at, price, response, importacao")
      .eq("vehicle_id", vehicle.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { const l = (data ?? []) as unknown as Consulta[]; setLista(l); setSel(l[0]?.id ?? ""); });
  }, [open, vehicle]);
  const c = lista?.find((x) => x.id === sel);
  const quando = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl text-xs">
        <DialogHeader><DialogTitle>Detalhes da consulta Detran — {vehicle?.plate}</DialogTitle></DialogHeader>
        {lista === null ? <p className="text-muted-foreground">Carregando…</p>
          : !lista.length ? <p className="text-muted-foreground">Nenhuma consulta gravada para esta placa. Use “Consultar débitos no Detran”.</p>
          : <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
            <Select value={sel} onValueChange={setSel}>
              <SelectTrigger className="h-8 text-xs w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>{lista.map((x) => <SelectItem key={x.id} value={x.id}>{quando(x.created_at)} · {x.uf}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!c || gerando} onClick={async () => {
              if (!c || !vehicle) return; setGerando(true);
              try { await exportDetranDetalhesPdf({ ...c, plate: vehicle.plate }); } catch (e) { toast.error("Não foi possível gerar o PDF: " + (e as Error).message); } finally { setGerando(false); }
            }}><FileDown className="h-4 w-4 mr-1" />Exportar PDF</Button>
            </div>
            {c?.importacao?.aviso && <div className="rounded border border-warning/40 bg-warning/10 p-2 break-words">{c.importacao.aviso}</div>}
            {c?.importacao?.debitos?.length ? <div className="rounded border p-2 space-y-1">
              <div className="font-medium">Débitos identificados</div>
              {c.importacao.debitos.map((d: any, i: number) => <div key={i} className="flex justify-between gap-2 min-w-0"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{d.tipo} {d.ano} — {d.descricao}</span><span className="font-mono shrink-0 whitespace-nowrap">{formatCurrency(d.valor)}</span></div>)}
            </div> : null}
            <div className="rounded border p-2 min-w-0 overflow-hidden"><Valor v={c?.response} /></div>
          </div>}
        <ProcessingOverlay open={gerando} label="Gerando PDF…" />
      </DialogContent>
    </Dialog>
  );
}
