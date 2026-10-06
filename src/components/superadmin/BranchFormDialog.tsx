import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupCnpj } from "@/lib/cnpjLookup";
import { buscarCodigoIbgePorMunicipio } from "@/lib/ibgeLookup";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RntrcField } from "@/components/RntrcField";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { TenantRow } from "./TenantFormDialog";
import { HomologationResult, runHomologationTest, type HmlResult } from "./HomologationResult";

export interface BranchRow {
  id: string; tenant_id: string; cnpj: string; razao_social: string; nome_fantasia: string | null; inscricao_estadual: string | null;
  rntrc: string | null; endereco_logradouro: string | null; endereco_numero: string | null; endereco_bairro: string | null;
  endereco_municipio: string | null; endereco_uf: string | null; endereco_cep: string | null; codigo_municipio_ibge: string | null;
  ambiente: "producao" | "homologacao"; serie_cte: number | null; serie_mdfe: number | null; active: boolean;
  ultimo_numero_cte: number | null; ultimo_numero_mdfe: number | null; ultimo_numero_cte_servico: number | null;
  has_token_production: boolean; has_token_homologation: boolean; has_certificate: boolean; same_certificate_as_matriz: boolean;
}

const emptyEst = {
  cnpj: "", razao_social: "", nome_fantasia: "", inscricao_estadual: "", rntrc: "", endereco_logradouro: "", endereco_numero: "",
  endereco_bairro: "", endereco_municipio: "", endereco_uf: "", endereco_cep: "", codigo_municipio_ibge: "",
  ambiente: "homologacao" as "producao" | "homologacao", serie_cte: 1, serie_mdfe: 1, active: true,
  ultimo_numero_cte: 0, ultimo_numero_cte_servico: 0, ultimo_numero_mdfe: 0,
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border">
      <h3 className="px-3 py-2 text-xs font-bold uppercase tracking-wide bg-muted/50 border-b">{title}</h3>
      <div className="p-3 grid grid-cols-1 md:grid-cols-6 gap-2">{children}</div>
    </section>
  );
}
function F({ label, span = 2, children }: { label: string; span?: number; children: ReactNode }) {
  const cls = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6" }[span];
  return <div className={cls}><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>;
}
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

export function BranchFormDialog({ open, onOpenChange, branch, tenants, onSaved, onUnmarkBranch }: {
  open: boolean; onOpenChange: (v: boolean) => void; branch: BranchRow | null; tenants: TenantRow[]; onSaved: () => void; onUnmarkBranch?: () => void;
}) {
  const [f, setF] = useState(emptyEst);
  const [matrizId, setMatrizId] = useState("");
  const [q, setQ] = useState("");
  const [certMode, setCertMode] = useState<"matriz" | "new">("matriz");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPass, setCertPass] = useState("");
  const [tokProd, setTokProd] = useState("");
  const [tokHom, setTokHom] = useState("");
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [hml, setHml] = useState<HmlResult | null>(null);
  const retest = async () => { if (!matriz || !(branch?.id || savedId)) return; setSaving(true); setHml(await runHomologationTest(matriz.id, (branch?.id || savedId)!, f.razao_social)); setSaving(false); };
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (branch) {
      const t: any = { ...emptyEst };
      for (const k of Object.keys(emptyEst)) t[k] = (branch as any)[k] ?? (emptyEst as any)[k];
      setF(t); setMatrizId(branch.tenant_id); setCertMode("matriz");
    } else { setF(emptyEst); setMatrizId(""); setCertMode("matriz"); }
    setQ(""); setCertFile(null); setCertPass(""); setTokProd(""); setTokHom(""); setHml(null); setSavedId(null);
  }, [open, branch]);

  const matriz = tenants.find((t) => t.id === matrizId) || null;
  const found = q.trim().length >= 2 ? tenants.filter((t) => {
    const s = q.toLowerCase(); const d = q.replace(/\D/g, "");
    return t.razao_social.toLowerCase().includes(s) || (t.nome_fantasia || "").toLowerCase().includes(s) || (d.length > 2 && t.cnpj.includes(d));
  }).slice(0, 8) : [];

  const pickMatriz = (t: TenantRow) => {
    setMatrizId(t.id); setQ("");
    setF((p) => ({ ...p, cnpj: p.cnpj || t.cnpj.slice(0, 8), razao_social: p.razao_social || `${t.razao_social} - Filial `, rntrc: p.rntrc || t.rntrc || "" }));
  };

  useEffect(() => {
    const m = (f.endereco_municipio || "").trim(), u = (f.endereco_uf || "").trim();
    if (!m || u.length !== 2) return;
    const t = setTimeout(async () => {
      const c = await buscarCodigoIbgePorMunicipio(u, m);
      if (c) setF((p) => (p.endereco_municipio === f.endereco_municipio && p.endereco_uf === f.endereco_uf ? { ...p, codigo_municipio_ibge: c } : p));
    }, 500);
    return () => clearTimeout(t);
  }, [f.endereco_municipio, f.endereco_uf]);
  const set = (k: keyof typeof emptyEst) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const buscar = async () => {
    const d = f.cnpj.replace(/\D/g, "");
    if (d.length !== 14) return toast.error("Informe o CNPJ completo da filial");
    setLooking(true);
    try {
      const r = await lookupCnpj(d);
      setF((p) => ({
        ...p, razao_social: r.razao_social ? `${r.razao_social}` : p.razao_social, nome_fantasia: r.nome_fantasia || p.nome_fantasia,
        endereco_logradouro: r.logradouro || p.endereco_logradouro, endereco_numero: r.numero || p.endereco_numero, endereco_bairro: r.bairro || p.endereco_bairro,
        endereco_municipio: r.municipio || p.endereco_municipio, endereco_uf: r.uf || p.endereco_uf, endereco_cep: r.cep || p.endereco_cep,
        inscricao_estadual: r.inscricao_estadual || p.inscricao_estadual,
        codigo_municipio_ibge: (r as any).codigo_municipio_ibge ? String((r as any).codigo_municipio_ibge) : p.codigo_municipio_ibge,
      }));
    } catch { toast.error("Não foi possível consultar o CNPJ"); }
    setLooking(false);
  };

  const save = async () => {
    if (!matriz) return toast.error("Selecione a empresa matriz");
    if (f.cnpj.replace(/\D/g, "").length !== 14 || !f.razao_social.trim()) return toast.error("CNPJ e razão social são obrigatórios");
    if (certMode === "new" && (!certFile || !certPass)) return toast.error("Envie o arquivo do certificado e a senha");
    setSaving(true); setHml(null);
    try {
      const payload: any = {
        ...f, id: branch?.id ?? savedId ?? null, type: "filial",
        serie_cte: Number(f.serie_cte) || 1, serie_mdfe: Number(f.serie_mdfe) || 1,
        ultimo_numero_cte: Number(f.ultimo_numero_cte) || 0, ultimo_numero_mdfe: Number(f.ultimo_numero_mdfe) || 0,
        ultimo_numero_cte_servico: Number(f.ultimo_numero_cte_servico) || 0,
      };
      for (const k of Object.keys(payload)) if (payload[k] === "") payload[k] = null;
      payload.cnpj = f.cnpj; payload.razao_social = f.razao_social;
      const certificate = certMode === "new" && certFile ? { file_name: certFile.name, base64: (await toBase64(certFile)).split(",")[1], password: certPass } : null;
      const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
        body: {
          action: "save_establishment", tenant_id: matriz.id, establishment: payload, certificate_mode: certMode, certificate,
          tokens: { focus_nfe_token_production: tokProd.trim() || undefined, focus_nfe_token_homologation: tokHom.trim() || undefined },
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(branch ? "Filial atualizada" : "Filial cadastrada");
      if (data.focus) (data.focus.ok ? toast.success : toast.error)(`Certificado na Focus: ${data.focus.message}`);
      setSavedId(data.id); setCertMode("matriz"); setTokProd(""); setTokHom("");
      onSaved();
      if (f.ambiente === "homologacao") {
        setHml(await runHomologationTest(matriz.id, data.id, f.razao_social));
      } else onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{branch ? "Editar filial" : "Nova empresa"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <section className="rounded-lg border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked disabled={!!branch} onCheckedChange={(v) => { if (!v) onUnmarkBranch?.(); }} /> Esta empresa é uma filial
            </label>
            {matriz ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Matriz:</span><b>{matriz.nome_fantasia || matriz.razao_social}</b><span className="tabular-nums text-muted-foreground">{fmtCnpj(matriz.cnpj)}</span>
                {!branch && <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] ml-auto" onClick={() => setMatrizId("")}>Trocar</Button>}
              </div>
            ) : (
              <div className="relative">
                <Label className="text-[11px] text-muted-foreground">Buscar empresa matriz *</Label>
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="h-9 pl-9" placeholder="Nome ou CNPJ da matriz" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
                {found.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded border bg-popover shadow">
                    {found.map((t) => (
                      <button key={t.id} type="button" className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted" onClick={() => pickMatriz(t)}>
                        <b>{t.nome_fantasia || t.razao_social}</b> <span className="text-muted-foreground tabular-nums">CNPJ: {fmtCnpj(t.cnpj)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {matriz && (
            <>
              <Block title="1. Dados cadastrais da filial">
                <F label="CNPJ *"><div className="flex gap-1"><Input className="h-9" value={f.cnpj} onChange={set("cnpj")} />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={buscar} disabled={looking} title="Buscar CNPJ">
                    {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div></F>
                <F label="Razão social *" span={4}><Input className="h-9" value={f.razao_social} onChange={set("razao_social")} /></F>
                <F label="Nome fantasia" span={2}><Input className="h-9" value={f.nome_fantasia || ""} onChange={set("nome_fantasia")} /></F>
                <F label="Inscrição estadual"><Input className="h-9" value={f.inscricao_estadual || ""} onChange={set("inscricao_estadual")} /></F>
                <F label="RNTRC"><RntrcField className="h-9" value={f.rntrc || ""} cnpj={f.cnpj} onChange={(v) => setF((p) => ({ ...p, rntrc: v }))} /></F>
                <F label="CEP" span={1}><Input className="h-9" value={f.endereco_cep || ""} onChange={set("endereco_cep")} /></F>
                <F label="Logradouro" span={4}><Input className="h-9" value={f.endereco_logradouro || ""} onChange={set("endereco_logradouro")} /></F>
                <F label="Número" span={1}><Input className="h-9" value={f.endereco_numero || ""} onChange={set("endereco_numero")} /></F>
                <F label="Bairro"><Input className="h-9" value={f.endereco_bairro || ""} onChange={set("endereco_bairro")} /></F>
                <F label="Município"><Input className="h-9" value={f.endereco_municipio || ""} onChange={set("endereco_municipio")} /></F>
                <F label="UF" span={1}><Input className="h-9" maxLength={2} value={f.endereco_uf || ""} onChange={(e) => setF((p) => ({ ...p, endereco_uf: e.target.value.toUpperCase() }))} /></F>
                <F label="Cód. IBGE" span={1}><Input className="h-9" value={f.codigo_municipio_ibge || ""} onChange={set("codigo_municipio_ibge")} /></F>
                <F label="Ativa" span={2}><div className="h-9 flex items-center"><Switch checked={f.active !== false} onCheckedChange={(v) => setF((p) => ({ ...p, active: v }))} /></div></F>
              </Block>

              <Block title="2. Fiscal e integrações">
                <F label="Ambiente fiscal">
                  <Select value={f.ambiente} onValueChange={(v: any) => setF((p) => ({ ...p, ambiente: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="homologacao">Homologação (teste)</SelectItem><SelectItem value="producao">Produção</SelectItem></SelectContent>
                  </Select>
                </F>
                <F label="Série CT-e" span={1}><Input type="number" className="h-9" value={f.serie_cte ?? 1} onChange={set("serie_cte")} /></F>
                <F label="Série MDF-e" span={1}><Input type="number" className="h-9" value={f.serie_mdfe ?? 1} onChange={set("serie_mdfe")} /></F>
                <F label="Token principal da conta Focus" span={2}>
                  <Input className="h-9" disabled value={matriz.has_master_token ? "•••••••• herdado da matriz" : "Matriz sem token principal"} /></F>
                <F label={`Token Focus produção ${branch?.has_token_production ? "(cadastrado)" : ""}`} span={3}>
                  <Input type="password" autoComplete="new-password" className="h-9" placeholder={branch?.has_token_production ? "•••••• deixe vazio para manter" : "Cole o token de produção desta filial"} value={tokProd} onChange={(e) => setTokProd(e.target.value)} /></F>
                <F label={`Token Focus homologação ${branch?.has_token_homologation ? "(cadastrado)" : ""}`} span={3}>
                  <Input type="password" autoComplete="new-password" className="h-9" placeholder={branch?.has_token_homologation ? "•••••• deixe vazio para manter" : "Cole o token de homologação desta filial"} value={tokHom} onChange={(e) => setTokHom(e.target.value)} /></F>
                <F label="Último nº CT-e (produção)"><Input type="number" className="h-9" value={f.ultimo_numero_cte ?? 0} onChange={set("ultimo_numero_cte")} /></F>
                <F label="Último nº MDF-e"><Input type="number" className="h-9" value={f.ultimo_numero_mdfe ?? 0} onChange={set("ultimo_numero_mdfe")} /></F>
                <F label="Certificado digital A1" span={6}>
                  <div className="flex flex-wrap gap-4 text-xs h-9 items-center">
                    <label className="inline-flex items-center gap-1.5"><input type="radio" checked={certMode === "matriz"} onChange={() => setCertMode("matriz")} />Usar o mesmo certificado da matriz{branch?.has_certificate && branch.same_certificate_as_matriz ? " (atual)" : ""}</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" checked={certMode === "new"} onChange={() => setCertMode("new")} />Inserir um novo certificado</label>
                  </div>
                </F>
                {certMode === "new" && (
                  <>
                    <F label="Arquivo do certificado (.pfx)" span={3}><Input type="file" accept=".pfx,.p12" className="h-9" onChange={(e) => setCertFile(e.target.files?.[0] || null)} /></F>
                    <F label="Senha do certificado" span={3}><Input type="password" className="h-9" value={certPass} onChange={(e) => setCertPass(e.target.value)} autoComplete="new-password" /></F>
                  </>
                )}
                <p className="md:col-span-6 text-[11px] text-muted-foreground">A filial usa os mesmos usuários e dados da matriz. Tokens e senha ficam guardados só no servidor. O certificado é validado e enviado à Focus automaticamente com o token principal da matriz.</p>
              </Block>
            </>
          )}
          {hml && <HomologationResult r={hml} />}
        </div>
        <DialogFooter>
          {hml ? (<>
            <Button variant="outline" className="h-10" onClick={retest} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Testar novamente</Button>
            <Button className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>Concluir</Button>
          </>) : (<>
            <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button className="h-10" onClick={save} disabled={saving || !matriz}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{saving ? "Salvando e testando..." : "Salvar"}</Button>
          </>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
