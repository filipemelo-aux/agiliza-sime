import { useState } from "react";
import JSZip from "jszip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const tx = (root: Element | Document | null | undefined, tag: string): string | null => {
  if (!root) return null;
  const el = root.getElementsByTagNameNS("*", tag)[0] || root.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || null;
};
const first = (root: Element | Document, tag: string): Element | null =>
  root.getElementsByTagNameNS("*", tag)[0] || root.getElementsByTagName(tag)[0] || null;
const all = (root: Element | Document, tag: string): Element[] => {
  const ns = Array.from(root.getElementsByTagNameNS("*", tag));
  return ns.length ? ns : Array.from(root.getElementsByTagName(tag));
};

/** Importa MDF-es autorizados a partir de XML (ou ZIP de XMLs), vinculando CT-es pela chave. */
export function MdfeXmlImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const readXmls = async (): Promise<{ name: string; xml: string }[]> => {
    const out: { name: string; xml: string }[] = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(f);
        for (const [n, entry] of Object.entries(zip.files)) if (!entry.dir && n.toLowerCase().endsWith(".xml")) out.push({ name: n, xml: await entry.async("string") });
      } else out.push({ name: f.name, xml: await f.text() });
    }
    return out;
  };

  const run = async () => {
    setBusy(true); setLog([]);
    const msgs: string[] = [];
    let ok = 0;
    try {
      const { data: ests } = await supabase.from("fiscal_establishments").select("id, cnpj");
      const estByCnpj = new Map((ests || []).map((e: any) => [String(e.cnpj || "").replace(/\D/g, ""), e.id]));
      for (const { name, xml } of await readXmls()) {
        try {
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          const inf = first(doc, "infMDFe");
          if (!inf) { msgs.push(`${name}: não é um XML de MDF-e`); continue; }
          const chave = (inf.getAttribute("Id") || "").replace(/^MDFe/, "") || tx(doc, "chMDFe");
          if (!chave) { msgs.push(`${name}: chave não encontrada`); continue; }
          const { data: dup } = await supabase.from("mdfe").select("id").eq("chave_acesso", chave).maybeSingle();
          if (dup) { msgs.push(`${name}: já importado`); continue; }
          const ide = first(inf, "ide")!;
          const emit = first(inf, "emit");
          const estId = estByCnpj.get(String(tx(emit, "CNPJ") || "").replace(/\D/g, ""));
          if (!estId) { msgs.push(`${name}: emitente ${tx(emit, "CNPJ")} não cadastrado`); continue; }
          const veic = first(inf, "veicTracao");
          const reboques = all(inf, "veicReboque").map((r) => tx(r, "placa"));
          const cond = veic ? first(veic, "condutor") : null;
          const carrega = first(inf, "infMunCarrega");
          const descarrega = all(inf, "infMunDescarga");
          const chavesCte = all(inf, "chCTe").map((e) => e.textContent?.trim() || "").filter(Boolean);
          const tot = first(inf, "tot");
          const prot = first(doc, "infProt");
          const cStat = tx(prot, "cStat");
          const { data: ctes } = chavesCte.length ? await supabase.from("ctes").select("id, chave_acesso").in("chave_acesso", chavesCte) : { data: [] as any[] };
          const seg = first(inf, "seg");
          const prod = first(inf, "prodPred");
          const qCarga = Number(tx(tot, "qCarga") || 0);
          const row: any = {
            establishment_id: estId,
            numero: Number(tx(ide, "nMDF")) || null,
            serie: Number(tx(ide, "serie")) || 1,
            data_emissao: tx(ide, "dhEmi"),
            data_saida: tx(ide, "dhIniViagem"),
            uf_carregamento: tx(ide, "UFIni"),
            uf_descarregamento: tx(ide, "UFFim"),
            ufs_percurso: all(ide, "UFPer").map((e) => e.textContent?.trim() || ""),
            municipio_carregamento_ibge: tx(carrega, "cMunCarrega"),
            municipio_carregamento_nome: tx(carrega, "xMunCarrega"),
            municipio_descarregamento_ibge: descarrega[0] ? tx(descarrega[0], "cMunDescarga") : null,
            municipio_descarregamento_nome: descarrega[0] ? tx(descarrega[0], "xMunDescarga") : null,
            placa_veiculo: tx(veic, "placa") || "",
            reboque1_placa: reboques[0] || null,
            reboque2_placa: reboques[1] || null,
            motorista_nome: tx(cond, "xNome"),
            motorista_cpf: tx(cond, "CPF"),
            rntrc: tx(inf, "RNTRC"),
            ciot_numero: tx(inf, "CIOT"),
            cte_ids: (ctes || []).map((c: any) => c.id),
            lista_ctes: chavesCte.filter((k) => (ctes || []).some((c: any) => c.chave_acesso === k)),
            chaves_cte_terceiros: chavesCte.filter((k) => !(ctes || []).some((c: any) => c.chave_acesso === k)),
            valor_total: Number(tx(tot, "vCarga") || 0),
            peso_total: tx(tot, "cUnid") === "02" ? qCarga * 1000 : qCarga,
            seguradora_nome: tx(seg, "xSeg"),
            seguradora_cnpj: tx(seg, "CNPJ"),
            apolice_numero: tx(seg, "nApol"),
            averbacao_numero: tx(seg, "nAver"),
            produto_predominante: tx(prod, "xProd"),
            ncm: tx(prod, "NCM"),
            observacoes: tx(inf, "infCpl"),
            chave_acesso: chave,
            protocolo_autorizacao: tx(prot, "nProt"),
            data_autorizacao: tx(prot, "dhRecbto"),
            status: cStat === "100" ? "autorizado" : prot ? "rejeitado" : "rascunho",
            motivo_rejeicao: cStat && cStat !== "100" ? tx(prot, "xMotivo") : null,
            xml_autorizado: prot ? xml : null,
            created_by: user?.id,
          };
          const { error } = await (supabase.from("mdfe") as any).insert(row);
          if (error) { msgs.push(`${name}: ${error.message}`); continue; }
          ok++;
        } catch (e) { msgs.push(`${name}: ${e instanceof Error ? e.message : "erro ao ler"}`); }
      }
      setLog(msgs);
      toast({ title: `${ok} MDF-e(s) importado(s)`, description: msgs.length ? `${msgs.length} arquivo(s) não importado(s).` : undefined, variant: ok ? undefined : "destructive" });
      if (ok) onImported();
      if (ok && !msgs.length) { setFiles([]); onOpenChange(false); }
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <ProcessingOverlay open={busy} label="Importando MDF-es..." />
        <DialogHeader>
          <DialogTitle className="font-display">Importar MDF-e por XML</DialogTitle>
          <DialogDescription className="text-xs">Selecione um ou mais XMLs (ou um ZIP). Os CT-es do manifesto são vinculados pela chave de acesso.</DialogDescription>
        </DialogHeader>
        <Input type="file" multiple accept=".xml,.zip" className="h-9 text-xs" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        {log.length > 0 && <div className="max-h-40 overflow-auto rounded border p-2 text-[11px] text-muted-foreground space-y-0.5">{log.map((l, i) => <p key={i}>{l}</p>)}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Fechar</Button>
          <Button onClick={run} disabled={!files.length || busy}>Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
