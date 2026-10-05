import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
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
}

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const F = ({ label, span = 2, children }: { label: string; span?: number; children: React.ReactNode }) => (
    <div className={{ 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6" }[span]}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>{children}
    </div>
  );


export function TenantEstablishments({ tenantId, tenantCnpj, tenantName }: { tenantId: string; tenantCnpj: string; tenantName: string }) {
  const [list, setList] = useState<Est[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Est | null>(null);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "list_establishments", tenant_id: tenantId } });
    setLoading(false);
    if (error || data?.error) return toast.error(data?.error || "Erro ao carregar estabelecimentos");
    setList(data.establishments || []);
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const novaFilial = () => setEdit({
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
    const payload: any = { ...edit, serie_cte: Number(edit.serie_cte) || 1, serie_mdfe: Number(edit.serie_mdfe) || 1 };
    for (const k of Object.keys(payload)) if (payload[k] === "") payload[k] = null;
    payload.cnpj = edit.cnpj; payload.razao_social = edit.razao_social;
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "save_establishment", tenant_id: tenantId, establishment: payload } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error || "Erro ao salvar estabelecimento");
    toast.success(edit.id ? "Estabelecimento atualizado" : "Filial cadastrada");
    setEdit(null); load();
  };

  return (
    <section className="rounded-lg border">
      <div className="flex items-center px-3 py-2 bg-muted/50 border-b">
        <h3 className="text-xs font-bold uppercase tracking-wide">3. Estabelecimentos (matriz e filiais)</h3>
        {!edit && <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={novaFilial}><Plus className="h-3.5 w-3.5 mr-1" />Nova filial</Button>}
      </div>
      <div className="p-3 space-y-2">
        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!loading && list.map((e) => (
          <div key={e.id} className={`flex items-center gap-3 rounded border p-2 text-xs ${e.active ? "" : "opacity-60"}`}>
            <Badge variant={e.type === "matriz" ? "default" : "secondary"} className="w-14 justify-center uppercase">{e.type}</Badge>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{e.razao_social}</div>
              <div className="text-muted-foreground tabular-nums">{fmtCnpj(e.cnpj)} · IE {e.inscricao_estadual || "—"} · {e.endereco_municipio || "—"}/{e.endereco_uf || "—"}</div>
            </div>
            <span className="text-muted-foreground">{e.ambiente === "producao" ? "Produção" : "Homologação"}{!e.active && " · Inativo"}</span>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => setEdit({ ...e } as Est)}><Pencil className="h-3.5 w-3.5" /></Button>
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
            <F label="Ativo" span={2}><div className="h-9 flex items-center"><Switch checked={edit.active !== false} onCheckedChange={(v) => setEdit((p) => p && ({ ...p, active: v }))} /></div></F>
            <div className="md:col-span-6 flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-9" onClick={() => setEdit(null)} disabled={saving}>Cancelar</Button>
              <Button type="button" className="h-9" onClick={salvar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar estabelecimento</Button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Filiais usam a mesma raiz de CNPJ, tokens e certificado da empresa. Os números de CT-e/MDF-e continuam sendo controlados pelo sistema.</p>
      </div>
    </section>
  );
}
