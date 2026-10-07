import { accentLike } from "@/lib/search";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ChevronDown, FileText, Loader2, MapPin, Package, Plus, Search, ShieldCheck, Trash2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PersonSearchInput } from "./PersonSearchInput";
import { maskPlate, maskCEP } from "@/lib/masks";
import { formatCurrency } from "@/lib/masks";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const TIPOS_CARGA = [
  ["01", "Granel sólido"], ["02", "Granel líquido"], ["03", "Frigorificada"], ["04", "Conteinerizada"],
  ["05", "Carga geral"], ["06", "Neogranel"], ["07", "Perigosa (granel sólido)"], ["08", "Perigosa (granel líquido)"],
  ["09", "Perigosa (frigorificada)"], ["10", "Perigosa (conteinerizada)"], ["11", "Perigosa (carga geral)"],
];

type CteLite = {
  id: string; numero: number | null; chave_acesso: string | null; status: string; data_emissao: string | null;
  remetente_nome: string | null; destinatario_nome: string | null; peso_bruto: number | null; valor_carga: number | null;
  valor_frete: number | null; uf_origem: string | null; uf_destino: string | null; municipio_origem_nome: string | null;
  municipio_destino_nome: string | null; municipio_origem_ibge: string | null; municipio_destino_ibge: string | null;
  establishment_id: string | null; placa_veiculo: string | null; rntrc: string | null; motorista_id: string | null;
  motorista_nome: string | null; veiculo_id: string | null; reboque1_placa: string | null; reboque2_placa: string | null;
  contratado_id: string | null; contratado_nome: string | null; contratado_documento: string | null;
  produto_predominante: string | null; seguradora_nome: string | null; seguradora_cnpj: string | null;
  apolice_numero: string | null; averbacao_numero: string | null; info_quantidade: any;
};

const CTE_FIELDS = "id,numero,chave_acesso,status,data_emissao,remetente_nome,destinatario_nome,peso_bruto,valor_carga,valor_frete,uf_origem,uf_destino,municipio_origem_nome,municipio_destino_nome,municipio_origem_ibge,municipio_destino_ibge,establishment_id,placa_veiculo,rntrc,motorista_id,motorista_nome,veiculo_id,reboque1_placa,reboque2_placa,contratado_id,contratado_nome,contratado_documento,produto_predominante,seguradora_nome,seguradora_cnpj,apolice_numero,averbacao_numero,info_quantidade";

type Pedagio = { pago_por: string; dispositivo: string; fornecedor_nome: string; fornecedor_cnpj: string; comprovante: string; valor: string };
type Condutor = { id: string; nome: string };

function FormBlock({
  icon: Icon,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  icon: React.ElementType;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border bg-card [&>button]:rounded-t-lg">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="h-auto w-full justify-start gap-2 rounded-b-none px-3 py-2 hover:bg-muted/60"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
          <Icon className="h-3 w-3" />
        </span>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">{title}</span>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {summary ? <span className="truncate text-[11px] font-normal text-muted-foreground">{summary}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        </span>
      </Button>
      <div className={open ? "space-y-2.5 rounded-b-lg border-t border-border px-3 pb-3 pt-2.5" : "hidden"}>{children}</div>
    </section>
  );
}

const emptyForm = () => ({
  tipo_manifesto: "normal", establishment_id: "", data_emissao: new Date().toISOString().slice(0, 16),
  uf_carregamento: "", municipio_carregamento_nome: "", municipio_carregamento_ibge: "",
  uf_descarregamento: "", municipio_descarregamento_nome: "", municipio_descarregamento_ibge: "",
  ufs_percurso: [] as string[], km_inicial: "", data_saida: "", conferente: "", observacoes: "",
  chaves_cte_terceiros: [] as string[], produto_predominante: "", tipo_carga: "01", ncm: "",
  cep_carregamento: "", cep_descarregamento: "", coord_carregamento: "", coord_descarregamento: "",
  motorista_id: null as string | null, motorista_nome: "", placa_veiculo: "", veiculo_id: null as string | null, rntrc: "",
  reboque1_placa: "", reboque2_placa: "", contratado_id: null as string | null, contratado_nome: "", contratado_documento: "",
  condutores_extras: [] as Condutor[], seguro_manual: false, seguradora_nome: "", seguradora_cnpj: "", apolice_numero: "", averbacao_numero: "",
  ciot_manual: false, ciot_numero: "", ciot_documento: "", vale_pedagio: [] as Pedagio[],
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: any | null;
  initialCteIds?: string[];
  onSaved: () => void;
}

export function MdfeFormDialog({ open, onOpenChange, editing, initialCteIds, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [ctes, setCtes] = useState<CteLite[]>([]);
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [cteSearch, setCteSearch] = useState("");
  const [cteOptions, setCteOptions] = useState<CteLite[]>([]);
  const [chaveTerceiro, setChaveTerceiro] = useState("");
  const [showTerceiros, setShowTerceiros] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    supabase.from("fiscal_establishments").select("id,razao_social,cnpj,type,seguradora_nome,seguradora_cnpj,apolice_numero").eq("active", true).order("type")
      .then(({ data }) => setEstablishments(data || []));
  }, []);

  // Carrega edição ou CT-es iniciais
  useEffect(() => {
    if (!open) return;
    (async () => {
      if (editing) {
        const f = emptyForm();
        Object.keys(f).forEach((k) => { if (editing[k] !== undefined && editing[k] !== null) (f as any)[k] = editing[k]; });
        f.data_emissao = (editing.data_emissao || new Date().toISOString()).slice(0, 16);
        f.data_saida = editing.data_saida ? editing.data_saida.slice(0, 16) : "";
        f.km_inicial = editing.km_inicial?.toString() ?? "";
        f.seguro_manual = !!editing.seguradora_nome;
        f.ciot_manual = !!editing.ciot_numero;
        setForm(f);
        setShowTerceiros((editing.chaves_cte_terceiros || []).length > 0);
        const ids = editing.cte_ids || [];
        if (ids.length) {
          const { data } = await supabase.from("ctes").select(CTE_FIELDS).in("id", ids);
          setCtes((data as any) || []);
        } else setCtes([]);
      } else {
        setForm(emptyForm());
        setCtes([]);
        setShowTerceiros(false);
        if (initialCteIds?.length) {
          const { data } = await supabase.from("ctes").select(CTE_FIELDS).in("id", initialCteIds);
          const list = ((data as any) || []) as CteLite[];
          setCtes(list);
          if (list.length) applyFromCtes(list, true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, initialCteIds?.join(",")]);

  // Preenche dados principais a partir dos CT-es (só campos vazios, exceto na primeira carga)
  const applyFromCtes = async (list: CteLite[], overwrite = false) => {
    const first = list[0];
    const last = list[list.length - 1];
    let reboques: string[] = [];
    if (first.veiculo_id && !first.reboque1_placa) {
      const { data } = await supabase.from("trailers").select("plate").eq("vehicle_id", first.veiculo_id).limit(2);
      reboques = (data || []).map((t: any) => maskPlate(t.plate || ""));
    }
    const est = establishments.find((e) => e.id === first.establishment_id);
    setForm((f) => {
      const pick = (k: keyof typeof f, v: any) => (overwrite || !f[k] ? v ?? f[k] : f[k]);
      return {
        ...f,
        establishment_id: pick("establishment_id", first.establishment_id),
        uf_carregamento: pick("uf_carregamento", first.uf_origem),
        municipio_carregamento_nome: pick("municipio_carregamento_nome", first.municipio_origem_nome),
        municipio_carregamento_ibge: pick("municipio_carregamento_ibge", first.municipio_origem_ibge),
        uf_descarregamento: pick("uf_descarregamento", last.uf_destino),
        municipio_descarregamento_nome: pick("municipio_descarregamento_nome", last.municipio_destino_nome),
        municipio_descarregamento_ibge: pick("municipio_descarregamento_ibge", last.municipio_destino_ibge),
        placa_veiculo: pick("placa_veiculo", first.placa_veiculo),
        veiculo_id: pick("veiculo_id", first.veiculo_id),
        rntrc: pick("rntrc", first.rntrc),
        motorista_id: pick("motorista_id", first.motorista_id),
        motorista_nome: pick("motorista_nome", first.motorista_nome),
        reboque1_placa: pick("reboque1_placa", first.reboque1_placa || reboques[0]),
        reboque2_placa: pick("reboque2_placa", first.reboque2_placa || reboques[1]),
        contratado_id: pick("contratado_id", first.contratado_id),
        contratado_nome: pick("contratado_nome", first.contratado_nome),
        contratado_documento: pick("contratado_documento", first.contratado_documento),
        produto_predominante: pick("produto_predominante", first.produto_predominante),
        seguradora_nome: pick("seguradora_nome", first.seguradora_nome || est?.seguradora_nome),
        seguradora_cnpj: pick("seguradora_cnpj", first.seguradora_cnpj || est?.seguradora_cnpj),
        apolice_numero: pick("apolice_numero", first.apolice_numero || est?.apolice_numero),
        averbacao_numero: pick("averbacao_numero", first.averbacao_numero),
      };
    });
  };

  // Busca CT-es de produção para vincular
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      let q = supabase.from("ctes").select(CTE_FIELDS).neq("tipo_talao", "servico").order("data_emissao", { ascending: false }).limit(15);
      const s = cteSearch.trim();
      if (s) {
        if (/^\d+$/.test(s)) q = q.eq("numero", Number(s));
        else q = q.or(`remetente_nome.ilike.%${accentLike(s)}%,destinatario_nome.ilike.%${accentLike(s)}%,placa_veiculo.ilike.%${accentLike(s)}%`);
      }
      const { data } = await q;
      setCteOptions(((data as any) || []).filter((c: CteLite) => !ctes.some((x) => x.id === c.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [cteSearch, open, ctes]);

  const addCte = (c: CteLite) => {
    const list = [...ctes, c];
    setCtes(list);
    setCteSearch("");
    applyFromCtes(list, ctes.length === 0);
  };

  const totals = useMemo(() => {
    const peso = ctes.reduce((s, c) => s + Number(c.peso_bruto || 0), 0);
    const valor = ctes.reduce((s, c) => s + Number(c.valor_carga || 0), 0);
    const qtd = ctes.reduce((s, c) => {
      const arr = Array.isArray(c.info_quantidade) ? c.info_quantidade : [];
      return s + arr.reduce((a: number, i: any) => a + Number(i?.quantidade || 0), 0);
    }, 0);
    return { peso, valor, qtd };
  }, [ctes]);

  const togglePercurso = (uf: string) =>
    set("ufs_percurso", form.ufs_percurso.includes(uf) ? form.ufs_percurso.filter((u) => u !== uf) : [...form.ufs_percurso, uf]);

  const handleSave = async () => {
    if (!form.establishment_id) return toast({ title: "Escolha o emitente", variant: "destructive" });
    if (!form.uf_carregamento || !form.uf_descarregamento) return toast({ title: "Informe UF de origem e destino", variant: "destructive" });
    if (!form.placa_veiculo) return toast({ title: "Informe a placa do veículo", variant: "destructive" });
    if (ctes.length === 0 && form.chaves_cte_terceiros.length === 0) return toast({ title: "Vincule pelo menos um CT-e", variant: "destructive" });
    setSaving(true);
    const { seguro_manual, ciot_manual, ...rest } = form;
    const payload: any = {
      ...rest,
      data_emissao: new Date(form.data_emissao).toISOString(),
      data_saida: form.data_saida ? new Date(form.data_saida).toISOString() : null,
      km_inicial: form.km_inicial ? Number(form.km_inicial) : null,
      cte_ids: ctes.map((c) => c.id),
      lista_ctes: [...ctes.map((c) => c.chave_acesso).filter(Boolean), ...form.chaves_cte_terceiros],
      peso_total: totals.peso, quantidade_total: totals.qtd, valor_total: totals.valor,
      ciot_numero: ciot_manual ? form.ciot_numero : null,
      ciot_documento: ciot_manual ? form.ciot_documento : null,
    };
    const res = editing
      ? await (supabase.from("mdfe") as any).update(payload).eq("id", editing.id)
      : await (supabase.from("mdfe") as any).insert({ ...payload, status: "rascunho", created_by: user?.id });
    setSaving(false);
    if (res.error) return toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
    toast({ title: editing ? "Manifesto atualizado" : "Manifesto criado (rascunho)" });
    onSaved();
    onOpenChange(false);
  };

  const F = ({ label, children, className = "" }: any) => (
    <div className={`space-y-1 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ProcessingOverlay open={saving} label="Salvando MDF-e..." />
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-4 sm:p-5">
        <DialogHeader><DialogTitle>{editing ? "Editar manifesto (MDF-e)" : "Novo manifesto (MDF-e)"}</DialogTitle></DialogHeader>

        <div className="space-y-2.5">
          <FormBlock icon={Building2} title="1. Identificação do manifesto" summary={establishments.find((e) => e.id === form.establishment_id)?.razao_social || "Emitente não selecionado"}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              <F label="Tipo de manifesto"><Select value={form.tipo_manifesto} onValueChange={(v) => set("tipo_manifesto", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="contingencia">Contingência</SelectItem></SelectContent></Select></F>
              <F label="Emitente *" className="md:col-span-2"><Select value={form.establishment_id} onValueChange={(v) => set("establishment_id", v)}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{establishments.map((e) => <SelectItem key={e.id} value={e.id}>{e.razao_social} ({e.type})</SelectItem>)}</SelectContent></Select></F>
              <F label="Data de emissão *"><Input type="datetime-local" className="h-8 text-xs" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} /></F>
              <F label="Data de saída"><Input type="datetime-local" className="h-8 text-xs" value={form.data_saida} onChange={(e) => set("data_saida", e.target.value)} /></F>
              <F label="Km inicial"><Input type="number" className="h-8 text-xs" value={form.km_inicial} onChange={(e) => set("km_inicial", e.target.value)} /></F>
              <F label="Conferente" className="sm:col-span-2"><Input className="h-8 text-xs" value={form.conferente || ""} onChange={(e) => set("conferente", e.target.value)} /></F>
            </div>
          </FormBlock>

          <FormBlock icon={MapPin} title="2. Percurso" summary={form.uf_carregamento && form.uf_descarregamento ? `${form.uf_carregamento} → ${form.uf_descarregamento}` : "Origem e destino"}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              <F label="UF origem *"><Select value={form.uf_carregamento || ""} onValueChange={(v) => set("uf_carregamento", v)}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></F>
              <F label="Município de carregamento"><Input className="h-8 text-xs" value={form.municipio_carregamento_nome || ""} onChange={(e) => set("municipio_carregamento_nome", e.target.value)} /></F>
              <F label="UF destino *"><Select value={form.uf_descarregamento || ""} onValueChange={(v) => set("uf_descarregamento", v)}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></F>
              <F label="Município de descarregamento"><Input className="h-8 text-xs" value={form.municipio_descarregamento_nome || ""} onChange={(e) => set("municipio_descarregamento_nome", e.target.value)} /></F>
            </div>
            <F label="UFs de percurso"><div className="flex flex-wrap gap-1">{UFS.map((u) => <Button key={u} type="button" size="sm" variant={form.ufs_percurso.includes(u) ? "default" : "outline"} onClick={() => togglePercurso(u)} className="h-6 min-w-8 px-1.5 text-[10px]">{u}</Button>)}</div></F>
            <F label="Observação"><Textarea rows={2} className="text-xs" value={form.observacoes || ""} onChange={(e) => set("observacoes", e.target.value)} /></F>
          </FormBlock>

          <FormBlock icon={FileText} title="3. Conhecimentos (CT-e)" summary={`${ctes.length + form.chaves_cte_terceiros.length} vinculado(s)`}>
            <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input className="h-8 pl-8 text-xs" placeholder="Buscar CT-e por número, remetente, destinatário ou placa..." value={cteSearch} onChange={(e) => setCteSearch(e.target.value)} />
              {cteSearch && cteOptions.length > 0 && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow">{cteOptions.map((c) => <Button key={c.id} type="button" variant="ghost" onClick={() => addCte(c)} className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-xs"><span><b>CT-e {c.numero ?? "—"}</b> · {c.remetente_nome} → {c.destinatario_nome} · {c.placa_veiculo} · {c.status}</span></Button>)}</div>}
            </div>
            {ctes.length > 0 && <div className="divide-y divide-border rounded-md border border-border">{ctes.map((c) => <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"><span><b>CT-e {c.numero ?? "—"}</b> · {c.municipio_origem_nome}/{c.uf_origem} → {c.municipio_destino_nome}/{c.uf_destino} · {Number(c.peso_bruto || 0).toLocaleString("pt-BR")} kg {c.status !== "autorizado" && <span className="text-warning">({c.status})</span>}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCtes(ctes.filter((x) => x.id !== c.id))}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={showTerceiros} onCheckedChange={(v) => setShowTerceiros(!!v)} /> Adicionar chave de acesso de CT-es de terceiros</label>
            {showTerceiros && <div className="space-y-1"><div className="flex gap-2"><Input className="h-8 font-mono text-xs" maxLength={44} placeholder="Chave de 44 dígitos" value={chaveTerceiro} onChange={(e) => setChaveTerceiro(e.target.value.replace(/\D/g, ""))} /><Button variant="outline" size="icon" className="h-8 w-8" disabled={chaveTerceiro.length !== 44} onClick={() => { set("chaves_cte_terceiros", [...form.chaves_cte_terceiros, chaveTerceiro]); setChaveTerceiro(""); }}><Plus className="h-4 w-4" /></Button></div>{form.chaves_cte_terceiros.map((key) => <div key={key} className="flex items-center justify-between gap-2 text-xs font-mono"><span className="truncate">{key}</span><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => set("chaves_cte_terceiros", form.chaves_cte_terceiros.filter((value) => value !== key))}><Trash2 className="h-3 w-3" /></Button></div>)}</div>}
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/50 p-2 text-xs sm:grid-cols-3"><div>Peso: <b>{totals.peso.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg</b></div><div>Quantidade: <b>{totals.qtd.toLocaleString("pt-BR")}</b></div><div>Valor da carga: <b>{formatCurrency(totals.valor)}</b></div></div>
          </FormBlock>

          <FormBlock icon={Package} title="4. Detalhamento da carga" summary={form.produto_predominante || "Produto e classificação"}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              <F label="Produto predominante" className="md:col-span-2"><Input className="h-8 text-xs" value={form.produto_predominante || ""} onChange={(e) => set("produto_predominante", e.target.value)} /></F>
              <F label="Tipo de carga"><Select value={form.tipo_carga} onValueChange={(v) => set("tipo_carga", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIPOS_CARGA.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></F>
              <F label="NCM"><Input className="h-8 text-xs" maxLength={8} value={form.ncm || ""} onChange={(e) => set("ncm", e.target.value.replace(/\D/g, ""))} /></F>
              <F label="CEP de carregamento"><Input className="h-8 text-xs" value={form.cep_carregamento || ""} onChange={(e) => set("cep_carregamento", maskCEP(e.target.value))} /></F>
              <F label="CEP de descarregamento"><Input className="h-8 text-xs" value={form.cep_descarregamento || ""} onChange={(e) => set("cep_descarregamento", maskCEP(e.target.value))} /></F>
              <F label="Coordenadas carregamento"><Input className="h-8 text-xs" placeholder="-5.81, -46.13" value={form.coord_carregamento || ""} onChange={(e) => set("coord_carregamento", e.target.value)} /></F>
              <F label="Coordenadas descarregamento"><Input className="h-8 text-xs" placeholder="-10.18, -48.33" value={form.coord_descarregamento || ""} onChange={(e) => set("coord_descarregamento", e.target.value)} /></F>
            </div>
          </FormBlock>

          <FormBlock icon={Truck} title="5. Motorista e veículo" summary={[form.motorista_nome, form.placa_veiculo].filter(Boolean).join(" · ") || "Transporte"}>
            <F label="Motorista"><PersonSearchInput categories={["motorista"]} placeholder="Buscar motorista..." selectedName={form.motorista_nome || undefined} onSelect={(p) => { set("motorista_id", p.id); set("motorista_nome", p.full_name); }} onClear={() => { set("motorista_id", null); set("motorista_nome", ""); }} /></F>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><F label="Veículo principal *"><Input className="h-8 uppercase text-xs" maxLength={8} value={form.placa_veiculo || ""} onChange={(e) => set("placa_veiculo", maskPlate(e.target.value))} /></F><F label="Carreta 1"><Input className="h-8 uppercase text-xs" maxLength={8} value={form.reboque1_placa || ""} onChange={(e) => set("reboque1_placa", maskPlate(e.target.value))} /></F><F label="Carreta 2"><Input className="h-8 uppercase text-xs" maxLength={8} value={form.reboque2_placa || ""} onChange={(e) => set("reboque2_placa", maskPlate(e.target.value))} /></F><F label="RNTRC"><Input className="h-8 text-xs" value={form.rntrc || ""} onChange={(e) => set("rntrc", e.target.value)} /></F></div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2"><F label="Contratado (dono do caminhão, quando de terceiro)"><PersonSearchInput categories={["proprietario", "motorista"]} placeholder="Buscar contratado..." selectedName={form.contratado_nome || undefined} onSelect={(p) => { set("contratado_id", p.id); set("contratado_nome", p.razao_social || p.full_name); set("contratado_documento", p.cnpj || ""); }} onClear={() => { set("contratado_id", null); set("contratado_nome", ""); set("contratado_documento", ""); }} /></F><F label="Auxiliares / outros motoristas"><PersonSearchInput categories={["motorista"]} placeholder="Adicionar outro motorista..." onSelect={(p) => { if (!form.condutores_extras.some((c) => c.id === p.id)) set("condutores_extras", [...form.condutores_extras, { id: p.id, nome: p.full_name }]); }} />{form.condutores_extras.map((c) => <div key={c.id} className="flex items-center justify-between text-xs"><span>{c.nome}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => set("condutores_extras", form.condutores_extras.filter((x) => x.id !== c.id))}><Trash2 className="h-3 w-3" /></Button></div>)}</F></div>
          </FormBlock>

          <FormBlock icon={ShieldCheck} title="6. Seguro e CIOT" summary={form.seguro_manual || form.ciot_manual ? "Preenchimento manual" : "Dados automáticos"} defaultOpen={false}>
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={form.seguro_manual} onCheckedChange={(v) => set("seguro_manual", !!v)} /> Definir seguradora manualmente</label>
            {form.seguro_manual && <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4"><F label="Seguradora"><Input className="h-8 text-xs" value={form.seguradora_nome || ""} onChange={(e) => set("seguradora_nome", e.target.value)} /></F><F label="CNPJ seguradora"><Input className="h-8 text-xs" value={form.seguradora_cnpj || ""} onChange={(e) => set("seguradora_cnpj", e.target.value)} /></F><F label="Apólice"><Input className="h-8 text-xs" value={form.apolice_numero || ""} onChange={(e) => set("apolice_numero", e.target.value)} /></F><F label="Averbação"><Input className="h-8 text-xs" value={form.averbacao_numero || ""} onChange={(e) => set("averbacao_numero", e.target.value)} /></F></div>}
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={form.ciot_manual} onCheckedChange={(v) => set("ciot_manual", !!v)} /> Definir CIOT manualmente (obrigatório para caminhão de terceiro/TAC)</label>
            {form.ciot_manual && <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"><F label="Número do CIOT"><Input className="h-8 text-xs" maxLength={12} value={form.ciot_numero || ""} onChange={(e) => set("ciot_numero", e.target.value.replace(/\D/g, ""))} /></F><F label="CPF/CNPJ do responsável"><Input className="h-8 text-xs" value={form.ciot_documento || ""} onChange={(e) => set("ciot_documento", e.target.value)} /></F></div>}
          </FormBlock>

          <FormBlock icon={MapPin} title="7. Vale-pedágio" summary={`${form.vale_pedagio.length} registro(s)`} defaultOpen={false}>
            {form.vale_pedagio.map((pedagio, i) => { const updatePedagio = (key: keyof Pedagio, value: string) => set("vale_pedagio", form.vale_pedagio.map((item, index) => index === i ? { ...item, [key]: value } : item)); return <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-md border border-border bg-muted/40 p-2 sm:grid-cols-2 md:grid-cols-6"><F label="Pago por"><Select value={pedagio.pago_por} onValueChange={(v) => updatePedagio("pago_por", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="emitente">Emitente</SelectItem><SelectItem value="contratante">Contratante</SelectItem></SelectContent></Select></F><F label="Dispositivo"><Select value={pedagio.dispositivo} onValueChange={(v) => updatePedagio("dispositivo", v)}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="tag">Tag</SelectItem><SelectItem value="cupom">Cupom</SelectItem><SelectItem value="cartao">Cartão</SelectItem></SelectContent></Select></F><F label="Fornecedora"><Input className="h-8 text-xs" value={pedagio.fornecedor_nome} onChange={(e) => updatePedagio("fornecedor_nome", e.target.value)} /></F><F label="CNPJ"><Input className="h-8 text-xs" value={pedagio.fornecedor_cnpj} onChange={(e) => updatePedagio("fornecedor_cnpj", e.target.value)} /></F><F label="Comprovante"><Input className="h-8 text-xs" value={pedagio.comprovante} onChange={(e) => updatePedagio("comprovante", e.target.value)} /></F><div className="flex gap-1"><F label="Valor" className="flex-1"><Input className="h-8 text-xs" value={pedagio.valor} onChange={(e) => updatePedagio("valor", e.target.value)} /></F><Button variant="ghost" size="icon" className="h-8 w-8 self-end" onClick={() => set("vale_pedagio", form.vale_pedagio.filter((_, index) => index !== i))}><Trash2 className="h-4 w-4" /></Button></div></div>; })}
            <Button variant="outline" size="sm" className="h-8 w-fit text-xs" onClick={() => set("vale_pedagio", [...form.vale_pedagio, { pago_por: "emitente", dispositivo: "", fornecedor_nome: "", fornecedor_cnpj: "", comprovante: "", valor: "" }])}><Plus className="mr-1 h-4 w-4" /> Adicionar vale-pedágio</Button>
          </FormBlock>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar rascunho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
