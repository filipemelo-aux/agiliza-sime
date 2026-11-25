import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { formatCurrency } from "@/lib/masks";
import { acharMarca, fipeAnos, fipeMarcas, fipeModelos, fipePreco, parseValorFipe, type FipeItem, type FipePreco } from "@/lib/fleet/fipe";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicle: { id: string; plate: string; brand: string; model: string; fipe_marca_id?: string | null; fipe_modelo_id?: string | null; fipe_ano_id?: string | null } | null;
  onSaved: () => void;
}
const sel = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";

export function FipeDialog({ open, onOpenChange, vehicle, onSaved }: Props) {
  const [marcas, setMarcas] = useState<FipeItem[]>([]);
  const [modelos, setModelos] = useState<FipeItem[]>([]);
  const [anos, setAnos] = useState<FipeItem[]>([]);
  const [marca, setMarca] = useState(""); const [modelo, setModelo] = useState(""); const [ano, setAno] = useState("");
  const [filtro, setFiltro] = useState("");
  const [preco, setPreco] = useState<FipePreco | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open || !vehicle) return;
    setPreco(null); setMarca(""); setModelo(""); setModelos([]); setAnos([]); setManual("");
    setFiltro(vehicle.fipe_modelo_id ? "" : (vehicle.model || "").split(" ")[0] || "");
    fipeMarcas("caminhoes").then((ms) => {
      setMarcas(ms);
      setMarca(vehicle.fipe_marca_id || acharMarca(ms, vehicle.brand)?.codigo || "");
    }).catch((e) => toast.error("FIPE: " + e.message));
  }, [open, vehicle]);

  useEffect(() => {
    setModelos([]); setModelo(""); setAnos([]); setPreco(null);
    if (!marca) return;
    fipeModelos("caminhoes", marca).then((ms) => { setModelos(ms); if (vehicle?.fipe_marca_id === marca && vehicle.fipe_modelo_id) setModelo(vehicle.fipe_modelo_id); })
      .catch((e) => toast.error("FIPE: " + e.message));
  }, [marca]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAnos([]); setAno(""); setPreco(null);
    if (!marca || !modelo) return;
    fipeAnos("caminhoes", marca, modelo).then((as) => { setAnos(as); if (vehicle?.fipe_modelo_id === modelo && vehicle.fipe_ano_id) setAno(vehicle.fipe_ano_id); })
      .catch((e) => toast.error("FIPE: " + e.message));
  }, [modelo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPreco(null);
    if (!marca || !modelo || !ano) return;
    fipePreco("caminhoes", marca, modelo, ano).then(setPreco).catch((e) => toast.error("FIPE: " + e.message));
  }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelosFiltrados = useMemo(() => {
    const q = filtro.trim().toUpperCase();
    const l = q ? modelos.filter((m) => m.nome.toUpperCase().includes(q) || m.codigo === modelo) : modelos;
    return l;
  }, [modelos, filtro, modelo]);

  const salvar = async (limpar = false) => {
    if (!vehicle) return;
    const valorManual = parseValorFipe(manual);
    if (!limpar && !preco && !valorManual) return;
    setBusy(true);
    const dados: any = limpar
      ? { fipe_marca_id: null, fipe_modelo_id: null, fipe_ano_id: null, fipe_descricao: null, fipe_codigo: null, fipe_valor: null, fipe_referencia: null, fipe_atualizado_em: null }
      : preco
        ? { fipe_marca_id: marca, fipe_modelo_id: modelo, fipe_ano_id: ano, fipe_descricao: `${preco.Marca} ${preco.Modelo} ${preco.AnoModelo}`, fipe_codigo: preco.CodigoFipe, fipe_valor: parseValorFipe(preco.Valor), fipe_referencia: preco.MesReferencia.trim(), fipe_atualizado_em: new Date().toISOString() }
        : { fipe_marca_id: null, fipe_modelo_id: null, fipe_ano_id: null, fipe_descricao: "Valor informado manualmente", fipe_codigo: null, fipe_valor: valorManual, fipe_referencia: null, fipe_atualizado_em: new Date().toISOString() };
    const { error } = await supabase.from("vehicles").update(dados).eq("id", vehicle.id);
    setBusy(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success("Valor de mercado salvo");
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Valor FIPE — {vehicle?.plate}</DialogTitle></DialogHeader>
        <div className="grid gap-2 text-xs">
          <p className="text-muted-foreground">Cadastro: {[vehicle?.brand, vehicle?.model].filter(Boolean).join(" ") || "—"}. Escolha o modelo correspondente na Tabela FIPE.</p>
          <label className="grid gap-1">Marca
            <select className={sel} value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="">Selecione…</option>
              {marcas.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Filtrar modelo
            <Input className="h-8 text-xs" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Ex.: R 450, FH 540" />
          </label>
          <label className="grid gap-1">Modelo ({modelosFiltrados.length})
            <select className={sel} value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={!modelos.length}>
              <option value="">Selecione…</option>
              {modelosFiltrados.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Ano
            <select className={sel} value={ano} onChange={(e) => setAno(e.target.value)} disabled={!anos.length}>
              <option value="">Selecione…</option>
              {anos.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
            </select>
          </label>
          {preco && (
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <div className="text-base font-semibold text-primary">{preco.Valor}</div>
              <div>Código FIPE {preco.CodigoFipe} · Referência {preco.MesReferencia.trim()}</div>
            </div>
          )}
          <label className="grid gap-1 pt-2 border-t border-border">Ou informe o valor de mercado à mão (implementos sem FIPE)
            <Input className="h-8 text-xs" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ex.: 180.000,00" disabled={!!preco} />
          </label>
          {!!parseValorFipe(manual) && !preco && <span>{formatCurrency(parseValorFipe(manual))}</span>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => salvar(true)} disabled={busy}>Limpar valor</Button>
          <Button onClick={() => salvar()} disabled={busy || (!preco && !parseValorFipe(manual))}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
