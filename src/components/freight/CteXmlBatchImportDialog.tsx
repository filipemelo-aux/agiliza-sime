import { useState } from "react";
import JSZip from "jszip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { maskName } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Recebe os ids dos CT-es criados para que a tela os selecione. */
  onImported: (ids: string[]) => void;
}

interface Actor { nome: string | null; cnpj: string | null; ie: string | null; uf: string | null; ibge: string | null; endereco: string | null }

interface ParsedCte {
  file: string;
  xml: string;
  chave: string;
  numero: number;
  serie: number;
  dhEmi: string;
  emitCnpj: string;
  cfop: string;
  natOp: string;
  tpCte: number;
  tpServ: number;
  tomaTipo: number;
  rem: Actor; dest: Actor; exp: Actor; receb: Actor; toma: Actor;
  munIni: string; ufIni: string; ibgeIni: string;
  munFim: string; ufFim: string; ibgeFim: string;
  valorFrete: number; valorReceber: number; valorCarga: number;
  peso: number; placa: string | null; produto: string | null;
  cst: string; bc: number; aliq: number; icms: number;
  protocolo: string | null; dhAut: string | null; cStat: string | null;
  chavesNfe: string[];
  // resultado
  state?: "ok" | "dup" | "err" | "pending";
  msg?: string;
}

const txt = (el: Element | Document | null | undefined, tag: string): string => {
  if (!el) return "";
  const n = (el as Element).getElementsByTagName(tag)[0];
  return n?.textContent?.trim() || "";
};
const num = (s: string) => Number(s || 0) || 0;

function parseActor(el: Element | undefined): Actor {
  if (!el) return { nome: null, cnpj: null, ie: null, uf: null, ibge: null, endereco: null };
  const end = Array.from(el.children).find((c) => c.tagName.startsWith("ender"));
  return {
    nome: maskName(txt(el, "xNome")) || null,
    cnpj: txt(el, "CNPJ") || txt(el, "CPF") || null,
    ie: txt(el, "IE") || null,
    uf: txt(end, "UF") || null,
    ibge: txt(end, "cMun") || null,
    endereco: end ? [txt(end, "xLgr"), txt(end, "nro"), txt(end, "xBairro"), txt(end, "xMun")].filter(Boolean).join(", ") : null,
  };
}

function parseCteXml(file: string, xml: string): ParsedCte {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const inf = doc.getElementsByTagName("infCte")[0];
  if (!inf) throw new Error("não é um XML de CT-e");
  const chave = (inf.getAttribute("Id") || "").replace(/^CTe/, "");
  const ide = inf.getElementsByTagName("ide")[0];
  const first = (t: string) => inf.getElementsByTagName(t)[0] as Element | undefined;
  const rem = parseActor(first("rem"));
  const dest = parseActor(first("dest"));
  const exp = parseActor(first("exped"));
  const receb = parseActor(first("receb"));
  const toma4 = first("toma4");
  const tomaTipo = toma4 ? 4 : num(txt(first("toma3"), "toma") || txt(ide, "toma"));
  const toma = toma4 ? parseActor(toma4) : [rem, exp, receb, dest][tomaTipo] || rem;

  // Peso: maior infQ em KG (cUnid 01) ou TON (02 → x1000)
  let peso = 0;
  for (const q of Array.from(inf.getElementsByTagName("infQ"))) {
    const u = txt(q, "cUnid");
    const v = num(txt(q, "qCarga"));
    const kg = u === "01" ? v : u === "02" ? v * 1000 : 0;
    if (kg > peso) peso = kg;
  }

  let placa = txt(inf, "placa") || null;
  if (!placa) {
    const blob = [txt(inf, "xObs"), ...Array.from(inf.getElementsByTagName("xTexto")).map((n) => n.textContent || "")].join(" ").toUpperCase();
    const m = blob.match(/\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b/);
    if (m) placa = m[1] + m[2];
  }
  if (placa) placa = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const icmsEl = first("ICMS");
  const icmsInner = icmsEl?.children[0];
  const prot = doc.getElementsByTagName("infProt")[0];

  return {
    file, xml, chave,
    numero: num(txt(ide, "nCT")),
    serie: num(txt(ide, "serie")),
    dhEmi: txt(ide, "dhEmi"),
    emitCnpj: txt(first("emit"), "CNPJ"),
    cfop: txt(ide, "CFOP"),
    natOp: txt(ide, "natOp"),
    tpCte: num(txt(ide, "tpCTe")),
    tpServ: num(txt(ide, "tpServ")),
    tomaTipo,
    rem, dest, exp, receb, toma,
    munIni: txt(ide, "xMunIni"), ufIni: txt(ide, "UFIni"), ibgeIni: txt(ide, "cMunIni"),
    munFim: txt(ide, "xMunFim"), ufFim: txt(ide, "UFFim"), ibgeFim: txt(ide, "cMunFim"),
    valorFrete: num(txt(first("vPrest"), "vTPrest")),
    valorReceber: num(txt(first("vPrest"), "vRec")),
    valorCarga: num(txt(first("infCarga"), "vCarga")),
    peso, placa,
    produto: txt(first("infCarga"), "proPred") || null,
    cst: txt(icmsInner, "CST") || "00",
    bc: num(txt(icmsInner, "vBC")),
    aliq: num(txt(icmsInner, "pICMS")),
    icms: num(txt(icmsInner, "vICMS")),
    protocolo: txt(prot, "nProt") || null,
    dhAut: txt(prot, "dhRecbto") || null,
    cStat: txt(prot, "cStat") || null,
    chavesNfe: Array.from(inf.getElementsByTagName("infNFe")).map((n) => txt(n, "chave")).filter(Boolean),
    state: "pending",
  };
}

export function CteXmlBatchImportDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<ParsedCte[]>([]);
  const [readErrors, setReadErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setItems([]); setReadErrors([]); setDone(false); };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const parsed: ParsedCte[] = [];
    const errs: string[] = [];
    const add = (name: string, xml: string) => {
      try {
        const p = parseCteXml(name, xml);
        if (parsed.some((x) => x.chave === p.chave)) return;
        parsed.push(p);
      } catch (e: any) { errs.push(`${name}: ${e.message}`); }
    };
    for (const f of Array.from(files)) {
      if (/\.zip$/i.test(f.name)) {
        const zip = await JSZip.loadAsync(f);
        for (const entry of Object.values(zip.files)) {
          if (!entry.dir && /\.xml$/i.test(entry.name)) add(entry.name, await entry.async("string"));
        }
      } else add(f.name, await f.text());
    }
    // Já existentes no sistema (mesma chave)
    const chaves = parsed.map((p) => p.chave);
    const existing = new Set<string>();
    for (let i = 0; i < chaves.length; i += 200) {
      const { data } = await supabase.from("ctes").select("chave_acesso").in("chave_acesso", chaves.slice(i, i + 200));
      (data || []).forEach((r: any) => existing.add(r.chave_acesso));
    }
    parsed.forEach((p) => { if (existing.has(p.chave)) { p.state = "dup"; p.msg = "Já existe no sistema"; } });
    parsed.sort((a, b) => a.numero - b.numero);
    setItems(parsed);
    setReadErrors(errs);
    setDone(false);
    setBusy(false);
  };

  const handleImport = async () => {
    setBusy(true);
    const { data: ests } = await supabase.from("fiscal_establishments").select("id, cnpj");
    const estByCnpj = new Map((ests || []).map((e: any) => [String(e.cnpj || "").replace(/\D/g, ""), e.id]));
    const created: string[] = [];
    const next = [...items];
    for (const p of next) {
      if (p.state !== "pending") continue;
      try {
        const estId = estByCnpj.get(p.emitCnpj);
        if (!estId) throw new Error(`Emitente ${p.emitCnpj} não é um estabelecimento cadastrado`);
        let tomadorId: string | null = null;
        if (p.toma.cnpj) {
          const { data: prof } = await supabase.from("profiles").select("id").eq("cnpj", p.toma.cnpj).limit(1).maybeSingle();
          tomadorId = (prof as any)?.id ?? null;
        }
        let veiculoId: string | null = null;
        if (p.placa) {
          const { data: v } = await supabase.from("vehicles").select("id").eq("plate", p.placa).limit(1).maybeSingle();
          veiculoId = (v as any)?.id ?? null;
        }
        const cancelado = p.cStat === "101" || p.cStat === "135";
        const row: Record<string, any> = {
          tipo_talao: "producao",
          status: cancelado ? "cancelado" : "autorizado",
          establishment_id: estId,
          numero: p.numero,
          serie: p.serie,
          chave_acesso: p.chave,
          protocolo_autorizacao: p.protocolo,
          data_autorizacao: p.dhAut || p.dhEmi,
          data_emissao: p.dhEmi,
          data_carregamento: p.dhEmi.slice(0, 10),
          xml_autorizado: p.xml,
          cfop: p.cfop || "0000",
          natureza_operacao: p.natOp || "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE",
          tp_cte: p.tpCte,
          tp_serv: p.tpServ,
          modal: "01",
          tomador_tipo: p.tomaTipo,
          tomador_id: tomadorId,
          tomador_nome: p.toma.nome, tomador_cnpj: p.toma.cnpj, tomador_ie: p.toma.ie, tomador_uf: p.toma.uf,
          remetente_nome: p.rem.nome || "", remetente_cnpj: p.rem.cnpj, remetente_ie: p.rem.ie, remetente_uf: p.rem.uf, remetente_municipio_ibge: p.rem.ibge, remetente_endereco: p.rem.endereco,
          destinatario_nome: p.dest.nome || "", destinatario_cnpj: p.dest.cnpj, destinatario_ie: p.dest.ie, destinatario_uf: p.dest.uf, destinatario_municipio_ibge: p.dest.ibge, destinatario_endereco: p.dest.endereco,
          expedidor_nome: p.exp.nome, expedidor_cnpj: p.exp.cnpj, expedidor_ie: p.exp.ie, expedidor_uf: p.exp.uf, expedidor_municipio_ibge: p.exp.ibge, expedidor_endereco: p.exp.endereco,
          recebedor_nome: p.receb.nome, recebedor_cnpj: p.receb.cnpj, recebedor_ie: p.receb.ie, recebedor_uf: p.receb.uf, recebedor_municipio_ibge: p.receb.ibge, recebedor_endereco: p.receb.endereco,
          municipio_origem_nome: p.munIni, uf_origem: p.ufIni, municipio_origem_ibge: p.ibgeIni,
          municipio_destino_nome: p.munFim, uf_destino: p.ufFim, municipio_destino_ibge: p.ibgeFim,
          placa_veiculo: p.placa,
          veiculo_id: veiculoId,
          peso_bruto: p.peso || null,
          valor_tonelada: p.peso > 0 ? +(p.valorFrete / (p.peso / 1000)).toFixed(2) : null,
          valor_frete: p.valorFrete,
          valor_receber: p.valorReceber || p.valorFrete,
          valor_carga: p.valorCarga,
          produto_predominante: p.produto,
          cst_icms: p.cst,
          base_calculo_icms: p.bc,
          aliquota_icms: p.aliq,
          valor_icms: p.icms,
          chaves_nfe_ref: p.chavesNfe.length ? p.chavesNfe : null,
          observacoes: "Importado de XML autorizado",
          created_by: user?.id ?? null,
        };
        const { data, error } = await supabase.from("ctes").insert(row as any).select("id").single();
        if (error) throw error;
        created.push(data.id);
        p.state = "ok"; p.msg = cancelado ? "Importado (cancelado)" : "Importado";
      } catch (e: any) {
        p.state = "err"; p.msg = e.message;
      }
      setItems([...next]);
    }
    setBusy(false);
    setDone(true);
    toast({ title: "Importação concluída", description: `${created.length} CT-e(s) importado(s). Eles ficam selecionados na lista para conferir inconsistências.` });
    onImported(created);
  };

  const pending = items.filter((i) => i.state === "pending").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Importar XML em lote — Talão de Produção</DialogTitle>
          <DialogDescription>
            Selecione arquivos XML de CT-es autorizados ou um ZIP com vários XMLs. CT-es com chave já cadastrada são ignorados.
          </DialogDescription>
        </DialogHeader>

        <Input type="file" accept=".xml,.zip" multiple disabled={busy} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} className="h-9 text-xs" />

        {readErrors.length > 0 && (
          <div className="text-[11px] text-destructive space-y-0.5">{readErrors.slice(0, 5).map((e) => <div key={e}>{e}</div>)}</div>
        )}

        {items.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto border border-border rounded-md">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left"><th className="p-1.5">Nº</th><th>Emissão</th><th>Tomador</th><th>Placa</th><th className="text-right">Peso (kg)</th><th className="text-right">Valor</th><th className="pl-2">Situação</th></tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.chave} className="border-t border-border/60">
                    <td className="p-1.5 font-mono">{p.numero}</td>
                    <td>{formatDateBR(p.dhEmi.slice(0, 10))}</td>
                    <td className="truncate max-w-[220px]">{p.toma.nome || "—"}</td>
                    <td>{p.placa || "—"}</td>
                    <td className="text-right">{p.peso.toLocaleString("pt-BR")}</td>
                    <td className="text-right">{p.valorFrete.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="pl-2">
                      {p.state === "pending" && <Badge variant="outline" className="text-[9px]">Pronto</Badge>}
                      {p.state === "ok" && <Badge className="text-[9px] bg-success text-success-foreground">{p.msg}</Badge>}
                      {p.state === "dup" && <Badge variant="secondary" className="text-[9px]">{p.msg}</Badge>}
                      {p.state === "err" && <span className="text-destructive" title={p.msg}>{p.msg?.slice(0, 60)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { onOpenChange(false); reset(); }}>Fechar</Button>
          {!done && (
            <Button size="sm" disabled={busy || pending === 0} onClick={handleImport} className="gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Importar {pending} CT-e(s)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
