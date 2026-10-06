import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Search, KeyRound, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupCnpj } from "@/lib/cnpjLookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Est {
  id?: string | null; type: "matriz" | "filial"; cnpj: string; razao_social: string; nome_fantasia: string;
  inscricao_estadual: string; rntrc: string; endereco_logradouro: string; endereco_numero: string; endereco_bairro: string;
  endereco_municipio: string; endereco_uf: string; endereco_cep: string; codigo_municipio_ibge: string;
  ambiente: "producao" | "homologacao"; serie_cte: number; serie_mdfe: number; active: boolean;
  ultimo_numero_cte?: number | null; ultimo_numero_mdfe?: number | null; ultimo_numero_cte_servico?: number | null;
  has_token_production?: boolean; has_token_homologation?: boolean;
}
interface Cert { id: string; nome: string; ativo: boolean; establishment_ids: string[]; cnpj?: string | null; titular?: string | null; valid_until?: string | null; focus_sync_status?: string | null; focus_sync_message?: string | null; focus_synced_at?: string | null }
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const F = ({ label, span = 2, children }: { label: string; span?: number; children: React.ReactNode }) => (
    <div className={{ 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6" }[span]}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>{children}
    </div>
  );


export function TenantEstablishments({ tenantId, tenantCnpj, tenantName }: { tenantId: string; tenantCnpj: string; tenantName: string }) {
  const [all, setAll] = useState<Est[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const list = all.filter((e) => e.type === "filial");
  const [tokProd, setTokProd] = useState("");
  const [tokHom, setTokHom] = useState("");
  const [hasMaster, setHasMaster] = useState(false);
  const [master, setMaster] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Est | null>(null);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "list_establishments", tenant_id: tenantId } });
    setLoading(false);
    if (error || data?.error) return toast.error(data?.error || "Erro ao carregar estabelecimentos");
    setAll(data.establishments || []);
    setCerts(data.certificates || []);
    setHasMaster(!!data.has_master_token);
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const toggleLink = async (certId: string, estId: string, on: boolean) => {
    const c = certs.find((x) => x.id === certId); if (!c) return;
    const ids = on ? [...new Set([...c.establishment_ids, estId])] : c.establishment_ids.filter((i) => i !== estId);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "set_certificate_links", tenant_id: tenantId, certificate_id: certId, establishment_ids: ids } });
    if (error || data?.error) return toast.error(data?.error || "Erro ao vincular certificado");
    toast.success("Vínculo do certificado atualizado"); load();
  };

  const openEdit = (e: Est | null) => { setTokProd(""); setTokHom(""); setEdit(e); };

  const saveMaster = async () => {
    setBusy("master");
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "set_master_token", tenant_id: tenantId, token: master.trim() || null } });
    setBusy(null);
    if (error || data?.error) return toast.error(data?.error || "Erro ao salvar token principal");
    toast.success("Token principal salvo"); setMaster(""); load();
  };

  const syncCert = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "sync_certificate", tenant_id: tenantId, certificate_id: id } });
    setBusy(null);
    if (error || data?.error) return toast.error(data?.error || "Erro ao enviar para a Focus");
    data.ok ? toast.success(data.message) : toast.error(data.message);
    load();
  };

  const testToken = async (estId: string, ambiente: "producao" | "homologacao") => {
    setBusy(estId + ambiente);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "test_focus_token", tenant_id: tenantId, establishment_id: estId, ambiente } });
    setBusy(null);
    if (error || data?.error) return toast.error(data?.error || "Erro ao testar token");
    data.ok ? toast.success(data.message) : toast.error(data.message);
  };

  const novaFilial = () => openEdit({
    id: null, type: "filial", cnpj: tenantCnpj.replace(/\D/g, "").slice(0, 8), razao_social: `${tenantName} - Filial `, nome_fantasia: "",
    inscricao_estadual: "", rntrc: "", endereco_logradouro: "", endereco_numero: "", endereco_bairro: "", endereco_municipio: "",
    endereco_uf: "", endereco_cep: "", codigo_municipio_ibge: "", ambiente: "homologacao", serie_cte: 1, serie_mdfe: 1, active: true,
  });

  const s = (k: keyof Est) => (e: React.ChangeEvent<HTMLInputElement>) => setEdit((p) => p && ({ ...p, [k]: e.target.value }));

  const buscar = async () => {
    if (!edit) return;
    const d = edit.cnpj.replace(/\D/g, "");
    if (d.length !== 14) return toast.error("Informe o CNPJ completo da filial");
    setLooking(true);
    try {
      const r = await lookupCnpj(d);
      setEdit((p) => p && ({
        ...p, nome_fantasia: r.nome_fantasia || p.nome_fantasia, endereco_logradouro: r.logradouro || p.endereco_logradouro,
        endereco_numero: r.numero || p.endereco_numero, endereco_bairro: r.bairro || p.endereco_bairro,
        endereco_municipio: r.municipio || p.endereco_municipio, endereco_uf: r.uf || p.endereco_uf, endereco_cep: r.cep || p.endereco_cep,
        inscricao_estadual: r.inscricao_estadual || p.inscricao_estadual,
        codigo_municipio_ibge: (r as any).codigo_municipio_ibge ? String((r as any).codigo_municipio_ibge) : p.codigo_municipio_ibge,
      }));
    } catch { toast.error("Não foi possível consultar o CNPJ"); }
    setLooking(false);
  };

  const salvar = async () => {
    if (!edit) return;
    setSaving(true);
    const { has_token_production: _a, has_token_homologation: _b, ...base } = edit;
    const payload: any = {
      ...base, serie_cte: Number(edit.serie_cte) || 1, serie_mdfe: Number(edit.serie_mdfe) || 1,
      ultimo_numero_cte: Number(edit.ultimo_numero_cte) || 0, ultimo_numero_mdfe: Number(edit.ultimo_numero_mdfe) || 0,
      ultimo_numero_cte_servico: Number(edit.ultimo_numero_cte_servico) || 0,
    };
    for (const k of Object.keys(payload)) if (payload[k] === "") payload[k] = null;
    payload.cnpj = edit.cnpj; payload.razao_social = edit.razao_social;
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "save_establishment", tenant_id: tenantId, establishment: payload, tokens: { focus_nfe_token_production: tokProd.trim() || undefined, focus_nfe_token_homologation: tokHom.trim() || undefined } } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error || "Erro ao salvar estabelecimento");
    toast.success(edit.id ? "Estabelecimento atualizado" : "Filial cadastrada");
    setEdit(null); load();
  };

  return (
    <section className="rounded-lg border">
      <div className="flex items-center px-3 py-2 bg-muted/50 border-b">
        <h3 className="text-xs font-bold uppercase tracking-wide">3. Estabelecimentos fiscais (matriz e filiais)</h3>
        {!edit && <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={novaFilial}><Plus className="h-3.5 w-3.5 mr-1" />Nova filial</Button>}
      </div>
      <div className="p-3 space-y-2">
        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!loading && list.length === 0 && !edit && <p className="text-xs text-muted-foreground">Nenhuma filial cadastrada. A matriz usa os dados cadastrais do bloco 1.</p>}
        {!loading && list.map((e) => (
          <div key={e.id} className={`flex items-center gap-3 rounded border p-2 text-xs ${e.active ? "" : "opacity-60"}`}>
            <Badge variant={e.type === "matriz" ? "default" : "secondary"} className="w-14 justify-center uppercase">{e.type}</Badge>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{e.razao_social}</div>
              <div className="text-muted-foreground tabular-nums">{fmtCnpj(e.cnpj)} · IE {e.inscricao_estadual || "—"} · {e.endereco_municipio || "—"}/{e.endereco_uf || "—"}</div>
            </div>
            <span className="text-muted-foreground text-right">{e.ambiente === "producao" ? "Produção" : "Homologação"}{!e.active && " · Inativo"}
              <span className="block text-[10px]">Token prod. {e.has_token_production ? "✓" : "—"} · homol. {e.has_token_homologation ? "✓" : "—"} · CT-e nº {e.ultimo_numero_cte ?? 0} · MDF-e nº {e.ultimo_numero_mdfe ?? 0}</span></span>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" title="Tokens da Focus" onClick={() => openEdit({ ...e } as Est)}><KeyRound className="h-3.5 w-3.5 mr-1" />Tokens Focus</Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit({ ...e } as Est)}><Pencil className="h-3.5 w-3.5" /></Button>
          </div>
        ))}

        {edit && (
          <div className="rounded border bg-muted/20 p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
            <p className="md:col-span-6 text-xs font-semibold">{edit.id ? `Editar ${edit.type}` : "Nova filial"}</p>
            <F label="CNPJ *"><div className="flex gap-1"><Input className="h-9" value={edit.cnpj} onChange={s("cnpj")} />
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={buscar} disabled={looking} title="Buscar CNPJ">
                {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div></F>
            <F label="Razão social *" span={4}><Input className="h-9" value={edit.razao_social} onChange={s("razao_social")} /></F>
            <F label="Nome fantasia" span={2}><Input className="h-9" value={edit.nome_fantasia || ""} onChange={s("nome_fantasia")} /></F>
            <F label="Inscrição estadual"><Input className="h-9" value={edit.inscricao_estadual || ""} onChange={s("inscricao_estadual")} /></F>
            <F label="RNTRC"><Input className="h-9" value={edit.rntrc || ""} onChange={s("rntrc")} /></F>
            <F label="CEP" span={1}><Input className="h-9" value={edit.endereco_cep || ""} onChange={s("endereco_cep")} /></F>
            <F label="Logradouro" span={4}><Input className="h-9" value={edit.endereco_logradouro || ""} onChange={s("endereco_logradouro")} /></F>
            <F label="Número" span={1}><Input className="h-9" value={edit.endereco_numero || ""} onChange={s("endereco_numero")} /></F>
            <F label="Bairro"><Input className="h-9" value={edit.endereco_bairro || ""} onChange={s("endereco_bairro")} /></F>
            <F label="Município"><Input className="h-9" value={edit.endereco_municipio || ""} onChange={s("endereco_municipio")} /></F>
            <F label="UF" span={1}><Input className="h-9" maxLength={2} value={edit.endereco_uf || ""} onChange={(e) => setEdit((p) => p && ({ ...p, endereco_uf: e.target.value.toUpperCase() }))} /></F>
            <F label="Cód. IBGE" span={1}><Input className="h-9" value={edit.codigo_municipio_ibge || ""} onChange={s("codigo_municipio_ibge")} /></F>
            <F label="Ambiente fiscal">
              <Select value={edit.ambiente} onValueChange={(v: any) => setEdit((p) => p && ({ ...p, ambiente: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="homologacao">Homologação (teste)</SelectItem><SelectItem value="producao">Produção</SelectItem></SelectContent>
              </Select>
            </F>
            <F label="Série CT-e" span={1}><Input type="number" className="h-9" value={edit.serie_cte ?? 1} onChange={s("serie_cte")} /></F>
            <F label="Série MDF-e" span={1}><Input type="number" className="h-9" value={edit.serie_mdfe ?? 1} onChange={s("serie_mdfe")} /></F>
            <F label="Último nº CT-e (produção)" span={2}><Input type="number" className="h-9" value={edit.ultimo_numero_cte ?? 0} onChange={s("ultimo_numero_cte")} /></F>
            <F label="Último nº CT-e (serviço)" span={2}><Input type="number" className="h-9" value={edit.ultimo_numero_cte_servico ?? 0} onChange={s("ultimo_numero_cte_servico")} /></F>
            <F label="Último nº MDF-e" span={2}><Input type="number" className="h-9" value={edit.ultimo_numero_mdfe ?? 0} onChange={s("ultimo_numero_mdfe")} /></F>
            <F label={`Token Focus produção ${edit.has_token_production ? "(configurado)" : ""}`} span={3}>
              <div className="flex gap-1"><Input type="password" autoComplete="new-password" className="h-9" placeholder={edit.has_token_production ? "•••••• deixe vazio para manter" : "Cole o token de produção"} value={tokProd} onChange={(e) => setTokProd(e.target.value)} />
                {edit.id && edit.has_token_production && <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Testar token" disabled={busy === edit.id + "producao"} onClick={() => testToken(edit.id!, "producao")}>{busy === edit.id + "producao" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}</Button>}</div></F>
            <F label={`Token Focus homologação ${edit.has_token_homologation ? "(configurado)" : ""}`} span={3}>
              <div className="flex gap-1"><Input type="password" autoComplete="new-password" className="h-9" placeholder={edit.has_token_homologation ? "•••••• deixe vazio para manter" : "Cole o token de homologação"} value={tokHom} onChange={(e) => setTokHom(e.target.value)} />
                {edit.id && edit.has_token_homologation && <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Testar token" disabled={busy === edit.id + "homologacao"} onClick={() => testToken(edit.id!, "homologacao")}>{busy === edit.id + "homologacao" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}</Button>}</div></F>
            <F label="Ativo" span={2}><div className="h-9 flex items-center"><Switch checked={edit.active !== false} onCheckedChange={(v) => setEdit((p) => p && ({ ...p, active: v }))} /></div></F>
            <div className="md:col-span-6 flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-9" onClick={() => openEdit(null)} disabled={saving}>Cancelar</Button>
              <Button type="button" className="h-9" onClick={salvar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar estabelecimento</Button>
            </div>
          </div>
        )}
        {!loading && certs.length > 0 && (
          <div className="rounded border p-2 space-y-1">
            <p className="text-xs font-semibold">Certificados digitais e vínculos</p>
            {certs.map((c) => (
              <div key={c.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{c.nome}{!c.ativo && " (inativo)"}</div>
                  <span className="text-muted-foreground">{c.titular || ""} {c.cnpj ? `· ${fmtCnpj(c.cnpj)}` : ""} · válido até {fmtDate(c.valid_until)}</span>
                  <Badge variant={c.focus_sync_status === "sincronizado" ? "default" : c.focus_sync_status === "erro" ? "destructive" : "secondary"} className="ml-auto text-[10px]">
                    Focus: {c.focus_sync_status || "não enviado"}</Badge>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy === c.id} onClick={() => syncCert(c.id)}>
                    {busy === c.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Enviar à Focus</Button>
                </div>
                {c.focus_sync_message && <div className="text-[11px] text-muted-foreground">{c.focus_sync_message} {c.focus_synced_at && `(${new Date(c.focus_synced_at).toLocaleString("pt-BR")})`}</div>}
                <div className="flex flex-wrap gap-3 mt-1">
                  {all.map((e) => (
                    <label key={e.id!} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <Switch checked={c.establishment_ids.includes(e.id!)} onCheckedChange={(v) => toggleLink(c.id, e.id!, v)} />
                      <span className="uppercase text-[10px] text-muted-foreground">{e.type}</span> {fmtCnpj(e.cnpj)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="rounded border p-2 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[240px]">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><KeyRound className="h-3 w-3" />Token principal da conta Focus {hasMaster ? "(configurado)" : "(não configurado)"}</Label>
            <Input type="password" autoComplete="new-password" className="h-9" placeholder="Usado para atualizar o certificado das empresas na Focus" value={master} onChange={(e) => setMaster(e.target.value)} />
          </div>
          <Button type="button" className="h-9" disabled={busy === "master" || !master.trim()} onClick={saveMaster}>{busy === "master" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar token principal</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Cada estabelecimento usa o próprio token da Focus; sem token próprio, vale o token da empresa. Quando o cliente envia um novo certificado, ele é validado, vinculado e enviado à Focus automaticamente.</p>
      </div>
    </section>
  );
}
