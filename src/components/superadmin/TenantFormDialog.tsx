import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupCnpj } from "@/lib/cnpjLookup";
import { buscarCodigoIbgePorMunicipio } from "@/lib/ibgeLookup";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { HomologationResult, runHomologationTest, type HmlResult } from "./HomologationResult";

export interface TenantRow {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; ie: string | null; rntrc: string | null;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null;
  uf: string | null; cep: string | null; codigo_municipio: string | null; telefone: string | null; email: string | null;
  logo_url: string | null; status: "active" | "suspended"; focus_environment: "production" | "homologation";
  nfe_sync_enabled?: boolean; nfe_sync_start_hour?: number; nfe_sync_interval_hours?: number;
  users_count: number; has_token_production: boolean; has_token_homologation: boolean; has_certificate_password: boolean; has_master_token?: boolean;
  certificate: { file_name: string | null; valid_until: string | null } | null;
  server_token_production?: boolean; server_token_homologation?: boolean;
}

const empty = {
  razao_social: "", nome_fantasia: "", cnpj: "", ie: "", rntrc: "", logradouro: "", numero: "", complemento: "", bairro: "",
  municipio: "", uf: "", cep: "", codigo_municipio: "", telefone: "", email: "", logo_url: "", focus_environment: "homologation" as const,
  nfe_sync_enabled: false as boolean, nfe_sync_start_hour: 8 as number, nfe_sync_interval_hours: 2 as number,
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

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
});

export function TenantFormDialog({ open, onOpenChange, tenant, onSaved, onMarkBranch }: {
  open: boolean; onOpenChange: (v: boolean) => void; tenant: TenantRow | null; onSaved: () => void; onMarkBranch?: () => void;
}) {
  const [hml, setHml] = useState<HmlResult | null>(null);
  const [matrizEstId, setMatrizEstId] = useState<string | null>(null);
  const [f, setF] = useState<typeof empty>(empty);
  const [tokProd, setTokProd] = useState("");
  const [tokHom, setTokHom] = useState("");
  const [tokMaster, setTokMaster] = useState("");
  const [certPass, setCertPass] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [adm, setAdm] = useState({ full_name: "", email: "", password: "" });
  const [matrizNums, setMatrizNums] = useState({ ultimo_numero_cte: 0, ultimo_numero_cte_servico: 0, ultimo_numero_mdfe: 0 });
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [testing, setTesting] = useState(false);

  const testFocus = async () => {
    if (!tenant || !matrizEstId) return;
    setTesting(true);
    setHml(await runHomologationTest(tenant.id, matrizEstId, f.razao_social || tenant.razao_social));
    setTesting(false);
  };

  useEffect(() => {
    if (!open) return;
    if (tenant) {
      const t: any = { ...empty };
      for (const k of Object.keys(empty)) t[k] = (tenant as any)[k] ?? (empty as any)[k];
      setF(t);
      supabase.functions.invoke("superadmin-tenants", { body: { action: "list_establishments", tenant_id: tenant.id } }).then(({ data }) => {
        const m = (data?.establishments || []).find((e: any) => e.type === "matriz");
        if (m) setMatrizEstId(m.id);
        if (m) setMatrizNums({
          ultimo_numero_cte: m.ultimo_numero_cte ?? 0,
          ultimo_numero_cte_servico: m.ultimo_numero_cte_servico ?? 0,
          ultimo_numero_mdfe: m.ultimo_numero_mdfe ?? 0,
        });
      });
    } else { setF(empty); setMatrizEstId(null); }
    setHml(null);
    setTokProd(""); setTokHom(""); setTokMaster(""); setCertPass(""); setCertFile(null); setAdm({ full_name: "", email: "", password: "" });
  }, [open, tenant]);

  useEffect(() => {
    const m = (f.municipio || "").trim(), u = (f.uf || "").trim();
    if (!m || u.length !== 2) return;
    const t = setTimeout(async () => {
      const c = await buscarCodigoIbgePorMunicipio(u, m);
      if (c) setF((p) => (p.municipio === f.municipio && p.uf === f.uf ? { ...p, codigo_municipio: c } : p));
    }, 500);
    return () => clearTimeout(t);
  }, [f.municipio, f.uf]);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const buscarCnpj = async () => {
    const d = f.cnpj.replace(/\D/g, "");
    if (d.length !== 14) return toast.error("Informe um CNPJ com 14 dígitos");
    setLooking(true);
    try {
      const r = await lookupCnpj(d);
      setF((p) => ({
        ...p, razao_social: r.razao_social || p.razao_social, nome_fantasia: r.nome_fantasia || p.nome_fantasia,
        logradouro: r.logradouro || p.logradouro, numero: r.numero || p.numero, complemento: r.complemento || p.complemento,
        bairro: r.bairro || p.bairro, municipio: r.municipio || p.municipio, uf: r.uf || p.uf, cep: r.cep || p.cep,
        telefone: r.ddd_telefone_1 || p.telefone, email: r.email || p.email, ie: r.inscricao_estadual || p.ie,
      }));
    } catch { toast.error("Não foi possível consultar o CNPJ"); }
    setLooking(false);
  };

  const onLogo = async (file?: File) => {
    if (!file) return;
    if (file.size > 300_000) return toast.error("Logo muito grande (máximo 300 KB)");
    const url = await toBase64(file);
    setF((p) => ({ ...p, logo_url: url }));
  };

  const save = async () => {
    if (!f.razao_social.trim() || f.cnpj.replace(/\D/g, "").length !== 14) return toast.error("Razão social e CNPJ são obrigatórios");
    const wantsAdmin = !tenant && (adm.email || adm.full_name || adm.password);
    if (!tenant && !wantsAdmin) return toast.error("Informe o administrador inicial da empresa");
    if (wantsAdmin && (!adm.full_name || !adm.email || adm.password.length < 8)) return toast.error("Administrador: nome, e-mail e senha (mín. 8) obrigatórios");
    setSaving(true);
    try {
      let certificate = null;
      if (certFile) certificate = { file_name: certFile.name, base64: (await toBase64(certFile)).split(",")[1] };
      const tenantPayload: any = { ...f, id: tenant?.id };
      for (const k of Object.keys(tenantPayload)) if (tenantPayload[k] === "") tenantPayload[k] = null;
      tenantPayload.razao_social = f.razao_social; tenantPayload.cnpj = f.cnpj;
      const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
        body: {
          action: "save", tenant: tenantPayload,
          secrets: { focus_nfe_token_production: tokProd || null, focus_nfe_token_homologation: tokHom || null, focus_nfe_token_master: tokMaster || null, certificate_password: certPass || null },
          certificate, admin: wantsAdmin ? adm : null,
          matriz_numeracao: tenant ? {
            ultimo_numero_cte: Number(matrizNums.ultimo_numero_cte) || 0,
            ultimo_numero_cte_servico: Number(matrizNums.ultimo_numero_cte_servico) || 0,
            ultimo_numero_mdfe: Number(matrizNums.ultimo_numero_mdfe) || 0,
          } : undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(tenant ? "Empresa atualizada" : "Empresa cadastrada com matriz e administrador");
      if (data?.focus) (data.focus.ok ? toast.success : toast.error)(`Certificado na Focus: ${data.focus.message}`);
      onSaved();
      if (f.focus_environment === "homologation") {
        let estId = matrizEstId;
        const tid = tenant?.id || data?.id;
        if (!estId && tid) {
          const { data: le } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "list_establishments", tenant_id: tid } });
          estId = (le?.establishments || []).find((e: any) => e.type === "matriz")?.id || null;
        }
        if (estId && tid) setHml(await runHomologationTest(tid, estId, f.razao_social));
        else onOpenChange(false);
      } else onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
    setSaving(false);
  };

  const saved = (b?: boolean, server?: boolean) => (b ? "cadastrado — preencha só para trocar" : server ? "usando o token padrão do servidor" : "não cadastrado");

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{tenant ? "Editar empresa" : "Nova empresa"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!tenant && (
            <label className="flex items-center gap-2 text-sm font-medium rounded-lg border p-3">
              <Switch checked={false} onCheckedChange={(v) => { if (v) onMarkBranch?.(); }} /> Esta empresa é uma filial
            </label>
          )}
          <Block title={tenant ? "1. Dados cadastrais (matriz)" : "1. Dados cadastrais"}>
            <F label="CNPJ *"><div className="flex gap-1"><Input className="h-9" value={f.cnpj} onChange={set("cnpj")} />
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={buscarCnpj} disabled={looking} title="Buscar CNPJ">
                {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div></F>
            <F label="Razão social *" span={4}><Input className="h-9" value={f.razao_social} onChange={set("razao_social")} /></F>
            <F label="Nome fantasia" span={2}><Input className="h-9" value={f.nome_fantasia} onChange={set("nome_fantasia")} /></F>
            <F label="Inscrição estadual"><Input className="h-9" value={f.ie} onChange={set("ie")} /></F>
            <F label="RNTRC"><Input className="h-9" value={f.rntrc} onChange={set("rntrc")} /></F>
            <F label="CEP" span={1}><Input className="h-9" value={f.cep} onChange={set("cep")} /></F>
            <F label="Logradouro" span={4}><Input className="h-9" value={f.logradouro} onChange={set("logradouro")} /></F>
            <F label="Número" span={1}><Input className="h-9" value={f.numero} onChange={set("numero")} /></F>
            <F label="Complemento"><Input className="h-9" value={f.complemento} onChange={set("complemento")} /></F>
            <F label="Bairro"><Input className="h-9" value={f.bairro} onChange={set("bairro")} /></F>
            <F label="Município"><Input className="h-9" value={f.municipio} onChange={set("municipio")} /></F>
            <F label="UF" span={1}><Input className="h-9" maxLength={2} value={f.uf} onChange={(e) => setF((p) => ({ ...p, uf: e.target.value.toUpperCase() }))} /></F>
            <F label="Cód. IBGE município" span={1}><Input className="h-9" value={f.codigo_municipio} onChange={set("codigo_municipio")} /></F>
            <F label="Telefone"><Input className="h-9" value={f.telefone} onChange={set("telefone")} /></F>
            <F label="E-mail"><Input className="h-9" value={f.email} onChange={set("email")} /></F>
            <F label="Logomarca" span={6}>
              <div className="flex items-center gap-3">
                {f.logo_url && <img src={f.logo_url} alt="Logo" className="h-12 w-auto rounded border bg-background p-1" />}
                <Input type="file" accept="image/*" className="h-9" onChange={(e) => onLogo(e.target.files?.[0])} />
              </div>
            </F>
          </Block>

          <Block title="2. Fiscal e integrações">
            <F label="Ambiente da matriz">
              <Select value={f.focus_environment} onValueChange={(v: any) => setF((p) => ({ ...p, focus_environment: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="homologation">Homologação (teste)</SelectItem><SelectItem value="production">Produção</SelectItem></SelectContent>
              </Select>
            </F>
            <F label={`Token Focus NF-e — Produção (${saved(tenant?.has_token_production, tenant?.server_token_production)})`} span={4}><Input type="password" className="h-9" placeholder={tenant?.has_token_production ? "•••••••• cadastrado" : ""} value={tokProd} onChange={(e) => setTokProd(e.target.value)} autoComplete="off" /></F>
            <F label={`Token Focus NF-e — Homologação (${saved(tenant?.has_token_homologation, tenant?.server_token_homologation)})`} span={6}><Input type="password" className="h-9" placeholder={tenant?.has_token_homologation ? "•••••••• cadastrado" : ""} value={tokHom} onChange={(e) => setTokHom(e.target.value)} autoComplete="off" /></F>
            <F label={`Token principal da conta Focus (${tenant?.has_master_token ? "cadastrado — preencha só para trocar" : "não cadastrado"})`} span={6}><Input type="password" className="h-9" placeholder={tenant?.has_master_token ? "•••••••• cadastrado" : "Token da conta Focus (vale para a matriz e todas as filiais)"} value={tokMaster} onChange={(e) => setTokMaster(e.target.value)} autoComplete="off" /></F>
            <F label={`Certificado A1 (.pfx)${tenant?.certificate ? ` — atual: ${tenant.certificate.file_name}` : ""}`} span={3}>
              <Input type="file" accept=".pfx,.p12" className="h-9" onChange={(e) => setCertFile(e.target.files?.[0] || null)} /></F>
            <F label={`Senha do certificado (${saved(tenant?.has_certificate_password)})`} span={3}><Input type="password" className="h-9" placeholder={tenant?.has_certificate_password ? "•••••••• cadastrada" : ""} value={certPass} onChange={(e) => setCertPass(e.target.value)} autoComplete="new-password" /></F>
            {tenant && (
              <>
                <F label="Último nº CT-e (produção)" span={2}><Input type="number" className="h-9" value={matrizNums.ultimo_numero_cte} onChange={(e) => setMatrizNums((p) => ({ ...p, ultimo_numero_cte: Number(e.target.value) || 0 }))} /></F>
                <F label="Último nº MDF-e" span={2}><Input type="number" className="h-9" value={matrizNums.ultimo_numero_mdfe} onChange={(e) => setMatrizNums((p) => ({ ...p, ultimo_numero_mdfe: Number(e.target.value) || 0 }))} /></F>
              </>
            )}
            <F label="Sincronização automática de NF-e recebidas">
              <Select value={f.nfe_sync_enabled ? "on" : "off"} onValueChange={(v) => setF((p) => ({ ...p, nfe_sync_enabled: v === "on" }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="on">Ativada</SelectItem><SelectItem value="off">Desativada</SelectItem></SelectContent>
              </Select>
            </F>
            <F label="Primeira sincronização do dia">
              <Select value={String(f.nfe_sync_start_hour)} onValueChange={(v) => setF((p) => ({ ...p, nfe_sync_start_hour: Number(v) }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Depois, a cada">
              <Select value={String(f.nfe_sync_interval_hours)} onValueChange={(v) => setF((p) => ({ ...p, nfe_sync_interval_hours: Number(v) }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 6, 8, 12, 24].map((h) => <SelectItem key={h} value={String(h)}>{h === 24 ? "Somente 1 vez ao dia" : `${h} hora(s)`}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <p className="md:col-span-3 self-end text-[11px] text-muted-foreground">Cada sincronização consulta a SEFAZ uma vez por CNPJ (horário de Brasília) e as notas ficam disponíveis para todos os usuários da empresa.</p>
            <p className="md:col-span-6 text-[11px] text-muted-foreground">Tokens e senha ficam guardados só no servidor e nunca são exibidos novamente. Token próprio da empresa tem prioridade sobre o padrão do servidor. O token principal é o da conta Focus da empresa: vale para a matriz e todas as filiais e é usado para atualizar o certificado na Focus automaticamente quando o cliente envia um novo.</p>
            {tenant && matrizEstId && (
              <div className="md:col-span-6">
                <Button type="button" variant="outline" className="h-10" onClick={testFocus} disabled={testing || saving}>
                  {testing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Verificar comunicação com a Focus
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">Confere na hora: dados fiscais, token, certificado A1 local e se a Focus reconhece a empresa e o certificado. Funciona em homologação e produção.</p>
              </div>
            )}
          </Block>

          {!tenant && (
            <>
              <Block title="3. Estabelecimento matriz">
                <p className="md:col-span-6 text-xs text-muted-foreground">A matriz fiscal será criada automaticamente com o CNPJ, IE, RNTRC, endereço e ambiente acima.</p>
              </Block>
              <Block title="4. Administrador inicial">
                <F label="Nome completo *" span={2}><Input className="h-9" value={adm.full_name} onChange={(e) => setAdm((p) => ({ ...p, full_name: e.target.value }))} /></F>
                <F label="E-mail de acesso *" span={2}><Input type="email" className="h-9" value={adm.email} onChange={(e) => setAdm((p) => ({ ...p, email: e.target.value }))} /></F>
                <F label="Senha provisória * (mín. 8)" span={2}><Input type="text" className="h-9" value={adm.password} onChange={(e) => setAdm((p) => ({ ...p, password: e.target.value }))} autoComplete="new-password" /></F>
                <p className="md:col-span-6 text-[11px] text-muted-foreground">No primeiro acesso o administrador será obrigado a trocar a senha.</p>
              </Block>
            </>
          )}
          {hml && <HomologationResult r={hml} />}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button className="h-10" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
