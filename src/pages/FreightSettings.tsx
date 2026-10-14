import { useEffect, useState } from "react";
import { PageTitle } from "@/components/PageTitle";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ShieldCheck, Star } from "lucide-react";
import { toast } from "@/lib/notice";

type Insurer = {
  id?: string; nome: string; cnpj: string | null; apolice_numero: string | null; responsavel: string;
  vigencia_fim: string | null; observacoes: string | null; is_default: boolean; active: boolean;
};
const empty: Insurer = { nome: "", cnpj: "", apolice_numero: "", responsavel: "emitente", vigencia_fim: null, observacoes: "", is_default: false, active: true };
const fmtCnpj = (v: string | null) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
};
const db = supabase as any;

export default function FreightSettings() {
  const { canEdit } = useUserRole();
  const [rows, setRows] = useState<Insurer[]>([]);
  const [edit, setEdit] = useState<Insurer | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await db.from("transport_insurers").select("*").order("nome");
    if (error) toast.error("Não foi possível carregar as seguradoras.");
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!edit) return;
    if (!edit.nome.trim()) return toast.error("Informe o nome da seguradora.");
    const cnpj = (edit.cnpj || "").replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) return toast.error("CNPJ da seguradora incompleto.");
    setSaving(true);
    const payload = { ...edit, nome: edit.nome.trim().toUpperCase(), cnpj: cnpj || null, apolice_numero: edit.apolice_numero?.trim() || null, observacoes: edit.observacoes?.trim() || null };
    delete (payload as any).id; delete (payload as any).created_at; delete (payload as any).updated_at; delete (payload as any).tenant_id;
    if (payload.is_default) await db.from("transport_insurers").update({ is_default: false }).neq("id", edit.id || "00000000-0000-0000-0000-000000000000");
    const { error } = edit.id
      ? await db.from("transport_insurers").update(payload).eq("id", edit.id)
      : await db.from("transport_insurers").insert(payload);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a seguradora.");
    toast.success("Seguradora salva.");
    setEdit(null); load();
  };

  const remove = async (r: Insurer) => {
    if (!confirm(`Excluir a seguradora ${r.nome}?`)) return;
    const { error } = await db.from("transport_insurers").delete().eq("id", r.id);
    if (error) return toast.error("Não foi possível excluir.");
    load();
  };

  const set = (k: keyof Insurer, v: any) => setEdit((e) => (e ? { ...e, [k]: v } : e));

  return (
    <AdminLayout>
      <div className="px-4 py-3 md:px-6 space-y-4">
        <PageTitle>Transporte — Configurações</PageTitle>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Seguradoras</CardTitle>
            {canEdit && <Button size="sm" onClick={() => setEdit({ ...empty })}><Plus className="h-4 w-4 mr-1" /> Nova seguradora</Button>}
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground mb-3">A seguradora padrão é usada automaticamente no MDF-e quando o CT-e e a filial não têm seguro informado.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">Seguradora</th><th>CNPJ</th><th>Apólice</th><th>Responsável</th><th>Vigência até</th><th>Situação</th><th className="w-20"></th>
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma seguradora cadastrada.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 font-medium">{r.nome} {r.is_default && <Star className="inline h-3 w-3 text-secondary fill-current ml-1" aria-label="Padrão" />}</td>
                      <td>{fmtCnpj(r.cnpj)}</td><td>{r.apolice_numero}</td>
                      <td>{r.responsavel === "contratante" ? "Contratante" : "Emitente"}</td>
                      <td>{r.vigencia_fim ? r.vigencia_fim.split("-").reverse().join("/") : "—"}</td>
                      <td>{r.active ? "Ativa" : "Inativa"}</td>
                      <td className="text-right">{canEdit && <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => setEdit({ ...r, cnpj: fmtCnpj(r.cnpj) })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar seguradora" : "Nova seguradora"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="col-span-2 space-y-1"><span>Nome da seguradora *</span><Input className="h-8 text-xs" value={edit.nome} onChange={(e) => set("nome", e.target.value)} /></label>
              <label className="space-y-1"><span>CNPJ</span><Input className="h-8 text-xs" value={edit.cnpj || ""} onChange={(e) => set("cnpj", fmtCnpj(e.target.value))} /></label>
              <label className="space-y-1"><span>Número da apólice</span><Input className="h-8 text-xs" value={edit.apolice_numero || ""} onChange={(e) => set("apolice_numero", e.target.value)} /></label>
              <label className="space-y-1"><span>Responsável pelo seguro</span>
                <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={edit.responsavel} onChange={(e) => set("responsavel", e.target.value)}>
                  <option value="emitente">Emitente do MDF-e</option><option value="contratante">Contratante do serviço</option>
                </select></label>
              <label className="space-y-1"><span>Vigência até</span><Input type="date" className="h-8 text-xs" value={edit.vigencia_fim || ""} onChange={(e) => set("vigencia_fim", e.target.value || null)} /></label>
              <label className="col-span-2 space-y-1"><span>Observações</span><Input className="h-8 text-xs" value={edit.observacoes || ""} onChange={(e) => set("observacoes", e.target.value)} /></label>
              <label className="flex items-center gap-2"><Checkbox checked={edit.is_default} onCheckedChange={(v) => set("is_default", !!v)} /> Seguradora padrão</label>
              <label className="flex items-center gap-2"><Checkbox checked={edit.active} onCheckedChange={(v) => set("active", !!v)} /> Ativa</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
