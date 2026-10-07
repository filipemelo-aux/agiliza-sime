import { PageTitle } from "@/components/PageTitle";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, GitBranch, LogIn, Pencil, Plus, Power, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/superadmin/SuperAdminLayout";
import { TenantFormDialog, type TenantRow } from "@/components/superadmin/TenantFormDialog";
import { BranchFormDialog, type BranchRow } from "@/components/superadmin/BranchFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default function SuperAdminTenants() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "list" } });
    setLoading(false);
    if (error || data?.error) return toast.error(data?.error || "Erro ao carregar empresas");
    setRows(data.tenants || []);
    setBranches(data.branches || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!t) return rows;
    const d = t.replace(/\D/g, "");
    return rows.filter((r) =>
      r.razao_social.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t) || (r.nome_fantasia || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t) || (d && r.cnpj.includes(d))
      || branches.some((b) => b.tenant_id === r.id && (b.razao_social.toLowerCase().includes(t) || (d && b.cnpj.includes(d)))));
  }, [rows, q, branches]);

  const toggleStatus = async (r: TenantRow) => {
    const status = r.status === "active" ? "suspended" : "active";
    if (status === "suspended" && !confirm(`Suspender o acesso de ${r.nome_fantasia || r.razao_social}? Os usuários dela não conseguirão acessar nenhum dado.`)) return;
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action: "set_status", id: r.id, status } });
    if (error || data?.error) return toast.error(data?.error || "Erro ao alterar situação");
    toast.success(status === "active" ? "Empresa ativada" : "Empresa suspensa");
    load();
  };

  const enterSupport = async (r: TenantRow) => {
    if (r.status !== "active") return toast.error("Ative a empresa antes de entrar em modo suporte");
    const { error } = await (supabase.rpc as any)("set_support_tenant", { _tenant_id: r.id });
    if (error) return toast.error("Não foi possível entrar na empresa");
    window.location.href = "/admin";
  };

  const active = rows.filter((r) => r.status === "active").length;

  return (
    <SuperAdminLayout>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <PageTitle>Empresas cadastradas</PageTitle>
          <p className="text-xs text-muted-foreground">{rows.length} empresas · {active} ativas · {rows.length - active} suspensas</p>
        </div>
        <Button className="ml-auto h-10" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova empresa
        </Button>
      </div>

      <SearchFilterCard className="mb-3">
        <FilterField label="Busca" className="min-w-[260px] flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="pl-9 h-9" />
          </div>
        </FilterField>
      </SearchFilterCard>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-3">Empresa</th>
              <th className="text-left p-3 w-44">CNPJ</th>
              <th className="text-left p-3 w-28">Ambiente</th>
              <th className="text-left p-3 w-24">Usuários</th>
              <th className="text-left p-3 w-28">Situação</th>
              <th className="text-right p-3 w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma empresa encontrada</td></tr>}
            {filtered.flatMap((r) => [
              <tr key={r.id} className={`border-t ${r.status === "suspended" ? "bg-muted/60 text-muted-foreground" : ""}`}>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {r.logo_url ? <img src={r.logo_url} alt="" className="h-8 w-8 object-contain rounded" /> : <Building2 className="h-8 w-8 p-1.5 rounded bg-muted text-muted-foreground" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.nome_fantasia || r.razao_social}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.razao_social}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 tabular-nums">{fmtCnpj(r.cnpj)}</td>
                <td className="p-3 text-xs">{r.focus_environment === "production" ? "Produção" : "Homologação"}</td>
                <td className="p-3"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.users_count}</span></td>
                <td className="p-3">
                  {r.status === "active"
                    ? <Badge className="bg-success/15 text-success hover:bg-success/15">Ativa</Badge>
                    : <Badge variant="secondary">Suspensa</Badge>}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Entrar em modo suporte" onClick={() => enterSupport(r)}><LogIn className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title={r.status === "active" ? "Suspender" : "Ativar"} onClick={() => toggleStatus(r)}
                      className={r.status === "active" ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}>
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>,
              ...branches.filter((b) => b.tenant_id === r.id).map((b) => (
                <tr key={b.id} className={`border-t ${b.active ? "" : "bg-muted/60 text-muted-foreground"}`}>
                  <td className="p-3 pl-8">
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-8 w-8 p-1.5 rounded bg-muted text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{b.nome_fantasia || b.razao_social}</div>
                        <div className="text-xs text-muted-foreground truncate">Filial de {r.nome_fantasia || r.razao_social}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 tabular-nums">{fmtCnpj(b.cnpj)}</td>
                  <td className="p-3 text-xs">{b.ambiente === "producao" ? "Produção" : "Homologação"}</td>
                  <td className="p-3 text-xs text-muted-foreground">da matriz</td>
                  <td className="p-3">{b.active ? <Badge className="bg-success/15 text-success hover:bg-success/15">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</td>
                  <td className="p-3"><div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Editar filial" onClick={() => { setEditingBranch(b); setBranchOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  </div></td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot className="bg-muted/60"><tr><td colSpan={20} className="px-3 py-1.5 text-[11px] text-muted-foreground">{filtered.length} empresa(s) · {branches.filter((b) => filtered.some((r) => r.id === b.tenant_id)).length} filial(is)</td></tr></tfoot>
        </table>
      </div>

      <TenantFormDialog open={open} onOpenChange={setOpen} tenant={editing} onSaved={load}
        onMarkBranch={() => { setOpen(false); setEditingBranch(null); setBranchOpen(true); }} />
      <BranchFormDialog open={branchOpen} onOpenChange={setBranchOpen} branch={editingBranch} tenants={rows} onSaved={load}
        onUnmarkBranch={() => { setBranchOpen(false); setEditing(null); setOpen(true); }} />
    </SuperAdminLayout>
  );
}
