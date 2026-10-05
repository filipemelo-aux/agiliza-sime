import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { RefreshCw, Receipt, Download, Printer, FileText } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { SearchFilterCard, FilterPrimaryRow } from "@/components/ui/search-filter-card";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { PeriodFilter } from "@/components/PeriodFilter";
import { EmpresaFilter } from "@/components/financial/EmpresaControls";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { SefazIcon } from "@/components/icons/SefazIcon";
import { ExpenseFormDialog } from "@/components/financial/ExpenseFormDialog";
import { CteFormDialog } from "@/components/freight/CteFormDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { openPrintWindow } from "@/components/freight/freightContractPrint";
import { syncNfesRecebidas, ensureNfeXml, type NfeRecebida } from "@/lib/nfeRecebidas";

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const monthEnd = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`; };
const fmtCnpj = (v?: string | null) => { const d = (v || "").replace(/\D/g, ""); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d; };

export default function NotasFiscaisConsulta() {
  const { toast } = useToast();
  const { isConsultor } = useUserRole() as any; // somente leitura
  const { establishments } = useUnifiedCompany() as any;
  const [rows, setRows] = useState<NfeRecebida[]>([]);
  const [usedExpense, setUsedExpense] = useState<Set<string>>(new Set());
  const [inicio, setInicio] = useState(monthStart());
  const [fim, setFim] = useState(monthEnd());
  const [empresa, setEmpresa] = useState("");
  const [ator, setAtor] = useState<"todos" | "destinatario" | "transportadora">("todos");
  const [situacao, setSituacao] = useState("todas");
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [expenseXml, setExpenseXml] = useState<{ xml: string; nota: NfeRecebida } | null>(null);
  const [cteXml, setCteXml] = useState<{ xml: string; nota: NfeRecebida } | null>(null);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);

  const load = useCallback(async () => {
    let q = supabase.from("nfes_recebidas" as any).select("*").order("data_emissao", { ascending: false }).limit(2000);
    if (inicio) q = q.gte("data_emissao", `${inicio}T00:00:00-03:00`);
    if (fim) q = q.lte("data_emissao", `${fim}T23:59:59-03:00`);
    const { data, error } = await q;
    if (error) { toast({ title: "Erro ao carregar notas", description: error.message, variant: "destructive" }); return; }
    const list = (data as any[]) as NfeRecebida[];
    setRows(list);
    const chaves = list.map((r) => r.chave);
    if (chaves.length) {
      const { data: exp } = await supabase.from("expenses").select("chave_nfe").in("chave_nfe", chaves.slice(0, 500)).is("deleted_at" as any, null);
      setUsedExpense(new Set(((exp as any[]) || []).map((e) => e.chave_nfe)));
    } else setUsedExpense(new Set());
  }, [inicio, fim, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from("chart_of_accounts").select("id, codigo, nome, conta_pai_id, nivel, tipo, tipo_operacional").eq("ativo", true).order("codigo")
      .then(({ data }) => setChartAccounts((data as any[]) || []));
  }, []);

  const filtered = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, "");
    return rows.filter((r) => {
      if (empresa && r.establishment_id !== empresa) return false;
      if (ator !== "todos" && r.ator !== ator) return false;
      if (situacao !== "todas" && (r.situacao || "autorizada") !== situacao) return false;
      if (!t) return true;
      return (r.emitente_nome || "").toLowerCase().includes(t) || (td && ((r.emitente_cnpj || "").includes(td) || r.chave.includes(td) || r.numero === td));
    });
  }, [rows, empresa, ator, situacao, busca]);

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const single = selectedRows.length === 1 ? selectedRows[0] : null;
  const estCnpj = (id: string | null) => establishments?.find((e: any) => e.id === id)?.cnpj || "";
  const isUsed = (r: NfeRecebida) => !!r.expense_id || !!r.cte_id || usedExpense.has(r.chave);

  const sync = async () => {
    setBusy("Consultando notas na SEFAZ...");
    try {
      const ests = (establishments || []).filter((e: any) => !empresa || e.id === empresa);
      const n = await syncNfesRecebidas(ests);
      toast({ title: "Consulta concluída", description: n ? `${n} nota(s) recebida(s) ou atualizada(s).` : "Nenhuma nota nova." });
      await load();
    } catch (e: any) {
      toast({ title: "Falha na consulta", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const openExpense = async () => {
    if (!single) return;
    if (isUsed(single)) { toast({ title: "Nota já utilizada", description: "Esta nota já foi lançada como despesa ou CT-e." }); return; }
    setBusy("Baixando XML da nota...");
    try { setExpenseXml({ xml: await ensureNfeXml(single, estCnpj(single.establishment_id)), nota: single }); }
    catch (e: any) { toast({ title: "XML indisponível", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const openCte = async () => {
    if (!single) return;
    if (single.cte_id) { toast({ title: "Nota já utilizada", description: "Já existe CT-e emitido a partir desta nota." }); return; }
    setBusy("Baixando XML da nota...");
    try { setCteXml({ xml: await ensureNfeXml(single, estCnpj(single.establishment_id)), nota: single }); }
    catch (e: any) { toast({ title: "XML indisponível", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const downloadXml = async () => {
    setBusy("Preparando XMLs...");
    try {
      const zip = new JSZip();
      let ok = 0;
      for (const r of selectedRows) {
        try { zip.file(`${r.chave}-nfe.xml`, await ensureNfeXml(r, estCnpj(r.establishment_id))); ok++; } catch { /* sem XML */ }
      }
      if (!ok) { toast({ title: "Nenhum XML disponível", variant: "destructive" }); return; }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `notas-recebidas-${inicio}_${fim}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally { setBusy(null); }
  };

  const printList = () => {
    const list = selectedRows.length ? selectedRows : filtered;
    const body = list.map((r) => `<tr><td>${r.numero || ""}</td><td>${r.serie || ""}</td><td>${formatDateBR(r.data_emissao?.slice(0, 10) || "")}</td><td>${r.emitente_nome || ""}</td><td>${fmtCnpj(r.emitente_cnpj)}</td><td>${r.ator === "transportadora" ? "Transportadora" : "Destinatário"}</td><td style="text-align:right">${formatCurrency(Number(r.valor) || 0)}</td></tr>`).join("");
    openPrintWindow(`<h3>Notas Fiscais Recebidas — ${formatDateBR(inicio)} a ${formatDateBR(fim)}</h3><table style="width:100%;border-collapse:collapse;font-size:11px" border="1" cellpadding="4"><thead><tr><th>Número</th><th>Série</th><th>Emissão</th><th>Emitente</th><th>CNPJ</th><th>Ator</th><th>Valor</th></tr></thead><tbody>${body}</tbody></table>`);
  };

  const actions: ToolbarAction[] = [
    { key: "sync", label: "Consultar na SEFAZ", icon: SefazIcon as any, onClick: sync, mode: "always", hidden: isConsultor, iconClassName: "!h-7 !w-7 md:!h-[26px] md:!w-[26px]" },
    { key: "expense", label: "Gerar despesa (nota de entrada)", icon: Receipt, onClick: openExpense, mode: "single", hidden: isConsultor, disabled: !single || single.ator !== "destinatario" || single.situacao === "cancelada" },
    { key: "cte", label: "Emitir CT-e (nota como transportadora)", icon: FileText, onClick: openCte, mode: "single", hidden: isConsultor, disabled: !single || single.ator !== "transportadora" || single.situacao === "cancelada" },
    { key: "xml", label: "Baixar XML", icon: Download, onClick: downloadXml, mode: "batch" },
    { key: "print", label: "Imprimir lista", icon: Printer, onClick: printList, mode: "always" },
    { key: "reload", label: "Atualizar lista", icon: RefreshCw, onClick: load, mode: "always" },
  ];

  const toggleAll = (v: boolean) => setSelected(v ? new Set(filtered.map((r) => r.id)) : new Set());
  const total = filtered.reduce((s, r) => s + (Number(r.valor) || 0), 0);

  return (
    <AdminLayout>
      <PageTitle>Consulta de Notas Fiscais</PageTitle>
      <div className="container mx-auto px-4 py-3 md:px-6 space-y-3">
        <SearchFilterCard contentClassName="sm:flex-col sm:items-stretch">
          <FilterPrimaryRow>
            <div className="mr-auto"><PeriodFilter inicio={inicio} fim={fim} size="sm" onChange={(i: string, f: string) => { setInicio(i); setFim(f); }} /></div>
            <EmpresaFilter value={empresa} onChange={setEmpresa} />
          </FilterPrimaryRow>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={ator} onValueChange={(v) => setAtor(v as any)}>
              <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os atores</SelectItem>
                <SelectItem value="destinatario">Destinatário (notas de entrada)</SelectItem>
                <SelectItem value="transportadora">Transportadora</SelectItem>
              </SelectContent>
            </Select>
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas situações</SelectItem>
                <SelectItem value="autorizada">Autorizada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-8 max-w-sm text-xs" placeholder="Emitente, CNPJ, número ou chave" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </SearchFilterCard>

        <GlobalToolbar actions={actions} selectedCount={selectedRows.length} />

        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="w-8 p-2"><Checkbox checked={filtered.length > 0 && selectedRows.length === filtered.length} onCheckedChange={(v) => toggleAll(!!v)} /></th>
                <th className="p-2 text-left">Número</th><th className="p-2 text-left">Série</th><th className="p-2 text-left">Emissão</th>
                <th className="p-2 text-left">Emitente</th><th className="p-2 text-left">CNPJ</th><th className="p-2 text-left">Ator</th>
                <th className="p-2 text-left">Situação</th><th className="p-2 text-right">Valor</th><th className="p-2 text-left">Chave</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const tone = r.situacao === "cancelada" ? "cancelled" : isUsed(r) ? "resolved" : "pending";
                return (
                  <tr key={r.id} className={`border-t cursor-pointer ${rowToneClass(tone as any)}`} onClick={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} /></td>
                    <td className="p-2">{r.numero}</td><td className="p-2">{r.serie}</td>
                    <td className="p-2 whitespace-nowrap">{formatDateBR(r.data_emissao?.slice(0, 10) || "")}</td>
                    <td className="p-2">{r.emitente_nome}</td><td className="p-2 whitespace-nowrap">{fmtCnpj(r.emitente_cnpj)}</td>
                    <td className="p-2">{r.ator === "transportadora" ? "Transportadora" : "Destinatário"}</td>
                    <td className="p-2 capitalize">{isUsed(r) && r.situacao !== "cancelada" ? "Utilizada" : r.situacao || "autorizada"}</td>
                    <td className="p-2 text-right whitespace-nowrap">{formatCurrency(Number(r.valor) || 0)}</td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{r.chave}</td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhuma nota no período. Use o botão da SEFAZ na barra de ações para consultar as notas recebidas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <StatusLegend items={[{ tone: "pending", label: "Disponível" }, { tone: "resolved", label: "Utilizada (despesa/CT-e)" }, { tone: "cancelled", label: "Cancelada" }] as any} />
          <span>{filtered.length} nota(s) · {formatCurrency(total)}</span>
        </div>
      </div>

      {expenseXml && (
        <ExpenseFormDialog
          open={!!expenseXml}
          onOpenChange={(o) => { if (!o) setExpenseXml(null); }}
          expense={null}
          empresaId={expenseXml.nota.establishment_id || ""}
          chartAccounts={chartAccounts}
          initialXml={expenseXml.xml}
          onSaved={async (id) => {
            if (id) await supabase.from("nfes_recebidas" as any).update({ expense_id: id } as any).eq("id", expenseXml.nota.id);
            setExpenseXml(null); load();
          }}
        />
      )}
      {cteXml && (
        <CteFormDialog
          open={!!cteXml}
          onOpenChange={(o) => { if (!o) { setCteXml(null); load(); } }}
          cte={null}
          initialXml={cteXml.xml}
          onSaved={async () => {
            const { data } = await supabase.from("ctes").select("id").contains("chaves_nfe_ref" as any, [cteXml.nota.chave] as any).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if ((data as any)?.id) await supabase.from("nfes_recebidas" as any).update({ cte_id: (data as any).id } as any).eq("id", cteXml.nota.id);
            load();
          }}
        />
      )}
      <ProcessingOverlay open={!!busy} label={busy || undefined} />
    </AdminLayout>
  );
}
