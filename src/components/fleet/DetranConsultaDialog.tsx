import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { documentoDoProprietario } from "../../../supabase/functions/vehicle-debts-sync/proprietario";

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const LOGIN_UFS = ["MG", "RS", "SC", "SP"];
// UFs cujos débitos (IPVA, licenciamento, multas) são gravados na tabela; usam só placa e RENAVAM
const UFS_DEBITOS = ["MA", "PA", "TO"];
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Imp = { gravados: number; quitados: number; debitos: { tipo: string; ano: number; valor: number; descricao: string }[] } | null;

const rotulo = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function Valor({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">Nenhum</span>;
    return <div className="space-y-1">{v.map((x, i) => <div key={i} className="rounded border p-2"><Valor v={x} /></div>)}</div>;
  }
  if (typeof v === "object") {
    return (
      <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[160px_1fr]">
        {Object.entries(v as Record<string, unknown>).filter(([k]) => !k.startsWith("normalizado_") && k !== "site_receipt").map(([k, x]) => (
          <div key={k} className="contents"><div className="text-muted-foreground">{rotulo(k)}</div><div className="break-words"><Valor v={x} /></div></div>
        ))}
      </div>
    );
  }
  return <span>{String(v)}</span>;
}

export function DetranConsultaDialog({ open, onOpenChange, vehicle, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; vehicle: { id: string; plate: string } | null; onSaved?: () => void;
}) {
  const [uf, setUf] = useState("GO");
  const [documento, setDocumento] = useState("");
  const [loginCpf, setLoginCpf] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [chassi, setChassi] = useState("");
  const [info, setInfo] = useState<{ renavam: string | null; chassis: string | null } | null>(null);
  useEffect(() => {
    if (!open || !vehicle) return;
    let active = true;
    setInfo(null); setChassi(""); setDocumento(""); setRes(null); setErro(null);
    void (async () => {
      try {
      const { data, error } = await supabase.from("vehicles").select("renavam, chassis, owner_id").eq("id", vehicle.id).maybeSingle();
      if (error) throw error;
      if (!active || !data) return;
      setInfo(data); setChassi(data.chassis ?? "");
      if (data.owner_id) {
        const { data: owners, error: ownerError } = await supabase.from("profiles").select("id, user_id, cnpj, address_state").or(`id.eq.${data.owner_id},user_id.eq.${data.owner_id}`);
        if (ownerError) throw ownerError;
        if (active) setDocumento(documentoDoProprietario(data.owner_id, owners ?? []));
        const dono = (owners ?? []).find((p: any) => p.id === data.owner_id) ?? (owners ?? []).find((p: any) => p.user_id === data.owner_id);
        const ufDono = String((dono as any)?.address_state ?? "").trim().toUpperCase();
        if (active && UFS.includes(ufDono)) setUf(ufDono);
      }
      } catch (error) {
        if (active) setErro(error instanceof Error ? error.message : "Não foi possível carregar o cadastro do proprietário.");
      }
    })();
    return () => { active = false; };
  }, [open, vehicle?.id]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<{ data: unknown[]; price: string | null; importacao: Imp } | null>(null);

  const consultar = async () => {
    if (!vehicle) return;
    setLoading(true); setErro(null); setRes(null);
    const { data, error } = await supabase.functions.invoke("vehicle-debts-sync", {
      body: { vehicle_id: vehicle.id, uf, chassi: chassi.trim() || undefined, documento: documento || undefined, login_cpf: loginCpf || undefined, login_senha: loginSenha || undefined },
    });
    setLoading(false);
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) { try { const b = await error.context.json(); msg = typeof b.error === "string" ? b.error : JSON.stringify(b.error); } catch { /* */ } }
      setErro(msg); return;
    }
    if (!data?.ok) {
      const extra = Array.isArray(data?.errors) && data.errors.length ? ` — ${data.errors.join("; ")}` : "";
      setErro(`${data?.error ?? "Consulta não concluída"}${extra}`); return;
    }
    setRes({ data: data.data, price: data.price, importacao: data.importacao ?? null });
    if (data.importacao) onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRes(null); setErro(null); setLoginSenha(""); } }}>
      <DialogContent className="max-w-3xl">
        <ProcessingOverlay open={loading} label="Consultando o Detran..." />
        <DialogHeader><DialogTitle>Consultar débitos no Detran — {vehicle?.plate}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4 text-xs">
          <div><Label className="text-xs">UF do veículo</Label>
            <Select value={uf} onValueChange={setUf}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">RENAVAM</Label><Input className="h-8 text-xs font-mono" value={info?.renavam ?? ""} readOnly /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Chassi {UFS_DEBITOS.includes(uf) ? "(opcional)" : info && !info.chassis && <span className="text-destructive">(não cadastrado — informe aqui, será salvo no veículo)</span>}</Label>
            <Input className="h-8 text-xs font-mono uppercase" maxLength={17} value={chassi} onChange={(e) => setChassi(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></div>
          {uf === "TO" && <div className="sm:col-span-3"><Label className="text-xs">CPF/CNPJ do proprietário *</Label>
            <Input className="h-8 text-xs" value={documento} onChange={(e) => setDocumento(e.target.value)} /></div>}
          {LOGIN_UFS.includes(uf) && <>
            <div className="sm:col-span-1"><Label className="text-xs">{uf === "SP" ? "CPF login Detran-SP" : "CPF login gov.br"}</Label>
              <Input className="h-8 text-xs" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Senha</Label>
              <Input type="password" className="h-8 text-xs" value={loginSenha} onChange={(e) => setLoginSenha(e.target.value)} autoComplete="off" /></div>
          </>}
        </div>
        <p className="text-[11px] text-muted-foreground">Cada consulta é cobrada pela InfoSimples conforme a UF.</p>
        <div className="flex justify-end"><Button onClick={consultar} disabled={loading || !vehicle || !info?.renavam || (uf === "TO" && ![11, 14].includes(documento.replace(/\D/g, "").length)) || (!UFS_DEBITOS.includes(uf) && !chassi.trim())}>Consultar</Button></div>
        {erro && <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{erro}</div>}
        {res && <div className="max-h-[50vh] overflow-y-auto text-xs space-y-2">
          {res.price && <div className="text-muted-foreground">Custo da consulta: R$ {res.price}</div>}
          {res.importacao ? <div className="rounded border p-2 space-y-1">
            <div className="font-medium">Gravado na tabela: {res.importacao.gravados} débito(s){res.importacao.quitados ? ` · ${res.importacao.quitados} marcado(s) como pago (não constam mais no Detran)` : ""}</div>
            {res.importacao.debitos.length ? res.importacao.debitos.map((d, i) => <div key={i} className="flex justify-between gap-2"><span>{d.tipo} {d.ano} — {d.descricao}</span><span className="font-mono">{fmt(d.valor)}</span></div>)
              : <div className="text-muted-foreground">Nenhum débito em aberto no Detran.</div>}
          </div> : <div className="rounded border p-2 text-muted-foreground">Esta UF retorna só restrições; nada foi gravado na tabela.</div>}
          <details><summary className="cursor-pointer text-muted-foreground">Resposta completa do Detran</summary><Valor v={res.data} /></details>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
