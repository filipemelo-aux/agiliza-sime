import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { Valor } from "./DetranConsultaDialog";

type Consulta = { id: string; uf: string; created_at: string; price: string | null; response: unknown; importacao: any };

/** Detalhes gravados das consultas ao Detran — sem chamar a API novamente. */
export function DetranDetalhesDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: { id: string; plate: string } | null }) {
  const [lista, setLista] = useState<Consulta[] | null>(null);
  const [sel, setSel] = useState<string>("");
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
            <Select value={sel} onValueChange={setSel}>
              <SelectTrigger className="h-8 text-xs w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>{lista.map((x) => <SelectItem key={x.id} value={x.id}>{quando(x.created_at)} · {x.uf}</SelectItem>)}</SelectContent>
            </Select>
            {c?.importacao?.debitos?.length ? <div className="rounded border p-2 space-y-1">
              <div className="font-medium">Débitos identificados</div>
              {c.importacao.debitos.map((d: any, i: number) => <div key={i} className="flex justify-between gap-2"><span>{d.tipo} {d.ano} — {d.descricao}</span><span className="font-mono">{formatCurrency(d.valor)}</span></div>)}
            </div> : null}
            <div className="rounded border p-2"><Valor v={c?.response} /></div>
          </div>}
      </DialogContent>
    </Dialog>
  );
}
