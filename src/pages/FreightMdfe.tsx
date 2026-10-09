import { PageTitle } from "@/components/PageTitle";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search, FileDown, Loader2, RefreshCw, Flag, Ban, FileCode, type LucideIcon } from "lucide-react";
import { SefazIcon } from "@/components/icons/SefazIcon";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { useAuth } from "@/contexts/AuthContext";
import { mdfeFocus } from "@/services/fiscal/focusMdfeService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { formatDateBR } from "@/lib/date";
import { MdfeFormDialog } from "@/components/freight/MdfeFormDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { buildMdfeHtml } from "@/components/freight/mdfePrint";
import { buildHtmlPdf } from "@/lib/htmlToPdf";
import { base64ToBytes, downloadBytes, mergePdfBytes } from "@/lib/mergePdfs";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", autorizado: "Autorizado", encerrado: "Encerrado", cancelado: "Cancelado", rejeitado: "Rejeitado", processando: "Processando",
};

export default function FreightMdfe() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [initialCteIds, setInitialCteIds] = useState<string[] | undefined>();
  const [printing, setPrinting] = useState(false);
  const { isConsultor } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [opDialog, setOpDialog] = useState<null | "cancelar" | "encerrar">(null);
  const [justificativa, setJustificativa] = useState("");
  const [dataEnc, setDataEnc] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("mdfe").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Abertura vinda do CT-e (?ctes=id1,id2)
  useEffect(() => {
    const ids = params.get("ctes");
    if (ids) {
      setEditing(null);
      setInitialCteIds(ids.split(",").filter(Boolean));
      setFormOpen(true);
      params.delete("ctes");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!s) return rows;
    return rows.filter((r) => [r.numero, r.placa_veiculo, r.motorista_nome, r.municipio_carregamento_nome, r.municipio_descarregamento_nome]
      .some((v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(s)));
  }, [rows, search]);

  const single = selected.size === 1 ? rows.find((r) => selected.has(r.id)) : null;
  const editable = single && ["rascunho", "rejeitado"].includes(single.status);

  const handleDelete = async () => {
    const ids = [...selected].filter((id) => ["rascunho", "rejeitado"].includes(rows.find((r) => r.id === id)?.status));
    if (!ids.length) return toast({ title: "Só é possível excluir rascunhos ou rejeitados", variant: "destructive" });
    const ok = await confirm({ title: "Excluir manifesto(s)?", description: `${ids.length} manifesto(s) serão excluídos.` });
    if (!ok) return;
    const { error } = await supabase.from("mdfe").delete().in("id", ids);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    setSelected(new Set());
    load();
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast({ title: "Erro", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    finally { setBusy(null); load(); }
  };

  const handleEmit = async () => {
    if (!single) return;
    const ok = await confirm({ title: `Emitir MDF-e ${single.numero ? "nº " + single.numero : ""} na SEFAZ?`, description: "O manifesto será transmitido à SEFAZ no ambiente do emitente. Após autorizado não poderá ser editado." });
    if (!ok) return;
    await run("Transmitindo MDF-e à SEFAZ...", async () => {
      const r = await mdfeFocus("emitir_mdfe_salvo", single.id);
      if (r.status === "autorizado") toast({ title: "MDF-e autorizado", description: `Nº ${r.numero} — protocolo ${r.protocolo || "-"}` });
      else if (r.success) toast({ title: "MDF-e em processamento", description: r.motivo_rejeicao });
      else toast({ title: "MDF-e não autorizado", description: r.motivo_rejeicao || r.error, variant: "destructive" });
    });
  };

  const handleConsult = () => single && run("Consultando situação na SEFAZ...", async () => {
    const r = await mdfeFocus("consultar_mdfe_salvo", single.id);
    toast({ title: r.success ? `Situação: ${STATUS_LABEL[r.status === "erro_autorizacao" ? "rejeitado" : r.status] || r.status}` : "Consulta", description: r.mensagem || r.error, variant: r.error ? "destructive" : undefined });
  });

  const handleXml = () => single && run("Baixando XML...", async () => {
    const r = await mdfeFocus("xml_mdfe_salvo", single.id);
    if (!r.success) throw new Error(r.error || "XML indisponível");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
    a.download = `MDFe-${single.chave_acesso || single.numero}.xml`; a.click();
  });

  const submitOp = async () => {
    if (!single || !opDialog) return;
    if (opDialog === "cancelar" && (justificativa.trim().length < 15)) return toast({ title: "Justificativa deve ter ao menos 15 caracteres", variant: "destructive" });
    const kind = opDialog;
    setOpDialog(null);
    await run(kind === "cancelar" ? "Cancelando MDF-e na SEFAZ..." : "Encerrando MDF-e na SEFAZ...", async () => {
      const r = kind === "cancelar"
        ? await mdfeFocus("cancelar_mdfe_salvo", single.id, { justificativa: justificativa.trim() })
        : await mdfeFocus("encerrar_mdfe_salvo", single.id, { data: dataEnc || undefined });
      if (r.success) toast({ title: kind === "cancelar" ? "MDF-e cancelado" : "MDF-e encerrado" });
      else toast({ title: kind === "cancelar" ? "Cancelamento não aceito" : "Encerramento não aceito", description: r.motivo || r.error, variant: "destructive" });
    });
  };

  // Bytes do DAMDFE de um manifesto: PDF oficial da SEFAZ quando autorizado, senão o modelo interno.
  const damdfeBytes = async (m: any): Promise<Uint8Array> => {
    if (["autorizado", "encerrado", "cancelado"].includes(m.status)) {
      const r = await mdfeFocus("damdfe_mdfe_salvo", m.id);
      if (r.success && r.pdf_base64) return base64ToBytes(r.pdf_base64);
    }
    const html = await buildMdfeHtml(m);
    const pdf = await buildHtmlPdf(html);
    return new Uint8Array(pdf.output("arraybuffer"));
  };

  const handlePrint = async () => {
    const list = filtered.filter((r) => selected.has(r.id));
    if (!list.length) return;
    setPrinting(true);
    try {
      if (list.length === 1) {
        const m = list[0];
        const bytes = await damdfeBytes(m);
        downloadBytes(bytes, `DAMDFE-${m.numero || m.id.slice(0, 8)}.pdf`);
        return;
      }
      // Lote: um único PDF, um manifesto por página, na ordem da listagem.
      const parts: Uint8Array[] = [];
      for (const m of list) parts.push(await damdfeBytes(m));
      const merged = await mergePdfBytes(parts);
      downloadBytes(merged, `DAMDFEs-lote-${list.length}.pdf`);
    } catch (error) {
      toast({ title: "Erro ao gerar DAMDFE", description: error instanceof Error ? error.message : "Não foi possível gerar o PDF.", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const columns: DataGridColumn<any>[] = [
    { key: "numero", header: "Nº", width: "60px", sortValue: (r) => r.numero ?? 0, cell: (r) => r.numero ?? "—" },
    { key: "emissao", header: "Emissão", width: "90px", sortValue: (r) => r.data_emissao || "", cell: (r) => formatDateBR(r.data_emissao) },
    { key: "rota", header: "Percurso", cell: (r) => `${r.municipio_carregamento_nome || ""}/${r.uf_carregamento || ""} → ${r.municipio_descarregamento_nome || ""}/${r.uf_descarregamento || ""}` },
    { key: "placa", header: "Placa", width: "90px", cell: (r) => r.placa_veiculo },
    { key: "motorista", header: "Motorista", cell: (r) => r.motorista_nome || "—" },
    { key: "ctes", header: "CT-es", width: "60px", cell: (r) => (r.lista_ctes || []).length },
    { key: "peso", header: "Peso (kg)", width: "100px", sortValue: (r) => Number(r.peso_total || 0), cell: (r) => Number(r.peso_total || 0).toLocaleString("pt-BR") },
    { key: "status", header: "Situação", width: "100px", sortValue: (r) => r.status, cell: (r) => <span title={r.motivo_rejeicao || undefined}>{STATUS_LABEL[r.status] || r.status}</span> },
    { key: "motivo", header: "Retorno SEFAZ", cell: (r) => <span className="text-[11px] text-muted-foreground line-clamp-2" title={r.motivo_rejeicao || ""}>{r.status === "autorizado" ? (r.protocolo_autorizacao ? `Prot. ${r.protocolo_autorizacao}` : "") : r.motivo_rejeicao || ""}</span> },
  ] as any;

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-3 space-y-3">
        <PageTitle>MDF-e — Manifestos de Carga</PageTitle>
        <SearchFilterCard>
          <FilterField label="Busca" className="min-w-[260px] flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-8 text-xs" placeholder="Buscar por número, placa, motorista ou cidade..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </FilterField>
        </SearchFilterCard>
        <GlobalToolbar
          actions={[
            { key: "new", label: "Novo MDF-e", icon: Plus, mode: "create", variant: "default", onClick: () => { setEditing(null); setInitialCteIds(undefined); setFormOpen(true); } },
            { key: "transmit", label: "SEFAZ", icon: SefazIcon as unknown as LucideIcon, mode: "single", variant: "secondary", priority: !!single, iconClassName: "!h-7 !w-7 md:!h-[26px] md:!w-[26px]", disabled: !single || isConsultor || !!busy || !["rascunho", "rejeitado", "processando"].includes(single.status), onClick: handleEmit },
            { key: "consult", label: "Consultar SEFAZ", icon: RefreshCw, mode: "single", disabled: !single || !!busy || single.status === "rascunho", onClick: handleConsult },
            { key: "close", label: "Encerrar", icon: Flag, mode: "single", disabled: !single || isConsultor || !!busy || single.status !== "autorizado", onClick: () => { setDataEnc(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })); setOpDialog("encerrar"); } },
            { key: "cancel", label: "Cancelar MDF-e", icon: Ban, mode: "single", variant: "destructive", disabled: !single || isConsultor || !!busy || single.status !== "autorizado", onClick: () => { setJustificativa(""); setOpDialog("cancelar"); } },
            { key: "xml", label: "Baixar XML", icon: FileCode, mode: "single", disabled: !single || !!busy || !["autorizado", "encerrado", "cancelado"].includes(single.status), onClick: handleXml },
            { key: "edit", label: "Editar", icon: Pencil, mode: "single", disabled: !editable || isConsultor, onClick: () => { setEditing(single); setFormOpen(true); } },
            { key: "print", label: printing ? "Gerando PDF" : "Baixar DAMDFE", icon: printing ? Loader2 : FileDown, mode: "single", disabled: !single || printing, onClick: handlePrint },
            { key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", disabled: selected.size === 0 || isConsultor, onClick: handleDelete },
          ] as any}
          selectedCount={selected.size}
        />
        <div>
          <DataGrid
            rows={filtered}
            columns={columns}
            rowId={(r) => r.id}
            selected={selected}
            onSelectedChange={setSelected}
            loading={loading}
            minWidth={860}
            rowClassName={(r) => rowToneClass(["autorizado", "encerrado"].includes(r.status) ? "resolved" : r.status === "rejeitado" ? "overdue" : r.status === "cancelado" ? "neutral" as any : "pending")}
            emptyMessage='Nenhum manifesto. Clique em "Novo MDF-e" ou gere a partir da tela de CT-e.'
          />
        </div>
        <StatusLegend />
      </div>
      <MdfeFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} initialCteIds={initialCteIds} onSaved={load} />
      {ConfirmDialog}
      <ProcessingOverlay open={!!busy} label={busy || ""} />
      <Dialog open={!!opDialog} onOpenChange={(o) => !o && setOpDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{opDialog === "cancelar" ? "Cancelar MDF-e" : "Encerrar MDF-e"} {single?.numero ? `nº ${single.numero}` : ""}</DialogTitle></DialogHeader>
          {opDialog === "cancelar" ? (
            <div className="space-y-1"><Label className="text-xs">Justificativa (15 a 255 caracteres)</Label>
              <Textarea value={justificativa} maxLength={255} onChange={(e) => setJustificativa(e.target.value)} className="text-xs" rows={3} />
              <p className="text-[10px] text-muted-foreground">{justificativa.trim().length}/255 — só é possível cancelar em até 24h após a autorização e antes do encerramento.</p></div>
          ) : (
            <div className="space-y-2 text-xs">
              <p>Local de encerramento: <b>{single?.municipio_descarregamento_nome}/{single?.uf_descarregamento}</b></p>
              <div className="space-y-1"><Label className="text-xs">Data do encerramento</Label><Input type="date" className="h-8 text-xs" value={dataEnc} onChange={(e) => setDataEnc(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setOpDialog(null)}>Voltar</Button><Button variant={opDialog === "cancelar" ? "destructive" : "default"} onClick={submitOp}>{opDialog === "cancelar" ? "Cancelar na SEFAZ" : "Encerrar na SEFAZ"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
