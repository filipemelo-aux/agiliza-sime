import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Split, Undo2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { type RateioRow } from "@/lib/rateio";
import { type RateioVehicleOption } from "./VehicleRateioEditor";

export interface ManualItem {
  uid: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  veiculo_id: string | null;
  grupo?: string;
  qtd_original?: number;
  total_original?: number;
}

let uidSeq = 0;
export const newManualUid = (p = "mi") => `${p}${Date.now()}-${++uidSeq}`;

export const somaItens = (itens: ManualItem[]) =>
  Number(itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0).toFixed(2));

/** Grupos desmembrados cuja soma de quantidades não bate com a quantidade original */
export function gruposInvalidosManual(itens: ManualItem[]) {
  const map = new Map<string, { desc: string; soma: number; original: number }>();
  for (const it of itens) {
    if (!it.grupo || it.qtd_original == null) continue;
    const cur = map.get(it.grupo) || { desc: it.descricao, soma: 0, original: it.qtd_original };
    cur.soma += Number(it.quantidade) || 0;
    map.set(it.grupo, cur);
  }
  return [...map.values()].filter((g) => Math.abs(g.soma - g.original) > 0.0001);
}

/** Rateio proporcional ao valor dos itens atribuídos a cada placa, sobre o valor lançado */
export function rateioFromItens(itens: ManualItem[], valorLancado: number): RateioRow[] {
  const total = somaItens(itens);
  const comVeiculo = itens.filter((i) => i.veiculo_id);
  if (comVeiculo.length === 0 || total <= 0) return [];
  const porVeiculo = new Map<string, number>();
  for (const it of comVeiculo) {
    const k = it.veiculo_id as string;
    porVeiculo.set(k, (porVeiculo.get(k) || 0) + (Number(it.valor_total) || 0));
  }
  const entries = [...porVeiculo.entries()];
  const somaAtribuida = entries.reduce((s, [, v]) => s + v, 0);
  const base = Number(valorLancado.toFixed(2));
  const totalCents = Math.round(base * 100 * (somaAtribuida / total));
  let acc = 0;
  return entries.map(([veiculo_id, valor], idx) => {
    const cents = idx === entries.length - 1 ? totalCents - acc : Math.round((valor / somaAtribuida) * totalCents);
    acc += cents;
    return { veiculo_id, valor_rateado: cents / 100, percentual: base ? (cents / 100 / base) * 100 : null };
  });
}

interface Props {
  itens: ManualItem[];
  onChange: (itens: ManualItem[]) => void;
  vehicles: RateioVehicleOption[];
  /** Valor que os itens precisam fechar (valor da parcela/lançamento) */
  valorAlvo: number;
  selectedUids: string[];
  onSelectedChange: (uids: string[]) => void;
  novoDesc: string;
  novoQtd: string;
  novoValor: string;
  onNovoChange: (patch: { desc?: string; qtd?: string; valor?: string }) => void;
}

export default function ManualItemsEditor({
  itens, onChange, vehicles, valorAlvo,
  selectedUids, onSelectedChange,
  novoDesc, novoQtd, novoValor, onNovoChange,
}: Props) {
  const total = useMemo(() => somaItens(itens), [itens]);
  const diff = Number((valorAlvo - total).toFixed(2));
  const grupoCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of itens) if (it.grupo) m.set(it.grupo, (m.get(it.grupo) || 0) + 1);
    return m;
  }, [itens]);
  const invalidos = useMemo(() => gruposInvalidosManual(itens), [itens]);
  const selectedRows = itens.filter((i) => selectedUids.includes(i.uid));

  const ratioTotal = (r: ManualItem, q: number) => {
    const qo = r.qtd_original ?? r.quantidade;
    const to = r.total_original ?? r.valor_total;
    return qo ? Number(((to * q) / qo).toFixed(2)) : 0;
  };

  const toggle = (uid: string) =>
    onSelectedChange(selectedUids.includes(uid) ? selectedUids.filter((u) => u !== uid) : [...selectedUids, uid]);

  const addItem = () => {
    const d = novoDesc.trim();
    const q = Number((novoQtd || "1").replace(",", ".")) || 0;
    const v = Number(unmaskCurrency(novoValor)) || 0;
    if (!d || q <= 0 || v <= 0) return;
    const totalLinha = Number((q * v).toFixed(2));
    onChange([...itens, {
      uid: newManualUid("i"), descricao: d, quantidade: q, valor_unitario: v,
      valor_total: totalLinha, veiculo_id: null,
      grupo: newManualUid("g"), qtd_original: q, total_original: totalLinha,
    }]);
    onNovoChange({ desc: "", qtd: "1", valor: "" });
  };

  const splitSelected = () => {
    const target = selectedRows[0];
    if (!target) return;
    const idx = itens.findIndex((r) => r.uid === target.uid);
    if (idx < 0) return;
    const it = itens[idx];
    const grupo = it.grupo || newManualUid("g");
    const base: ManualItem = {
      ...it, grupo,
      qtd_original: it.qtd_original ?? it.quantidade,
      total_original: it.total_original ?? it.valor_total,
    };
    const qA = Number((it.quantidade / 2).toFixed(4));
    const qB = Number((it.quantidade - qA).toFixed(4));
    const a = { ...base, uid: newManualUid("i"), quantidade: qA, valor_total: ratioTotal(base, qA) };
    const b = { ...base, uid: newManualUid("i"), quantidade: qB, valor_total: ratioTotal(base, qB), veiculo_id: null };
    onChange([...itens.slice(0, idx), a, b, ...itens.slice(idx + 1)]);
    onSelectedChange([]);
  };

  const undoSplit = () => {
    const grupos = new Set(selectedRows.map((r) => r.grupo).filter(Boolean) as string[]);
    if (grupos.size === 0) return;
    const out: ManualItem[] = [];
    const feitos = new Set<string>();
    for (const r of itens) {
      if (!r.grupo || !grupos.has(r.grupo)) { out.push(r); continue; }
      if (feitos.has(r.grupo)) continue;
      feitos.add(r.grupo);
      out.push({ ...r, quantidade: r.qtd_original ?? r.quantidade, valor_total: r.total_original ?? r.valor_total });
    }
    onChange(out);
    onSelectedChange([]);
  };

  const removeSelected = () => {
    onChange(itens.filter((r) => !selectedUids.includes(r.uid)));
    onSelectedChange([]);
  };

  const updateQtd = (uid: string, raw: string) => {
    const q = Number(raw.replace(",", ".")) || 0;
    onChange(itens.map((r) => (r.uid === uid ? { ...r, quantidade: q, valor_total: ratioTotal(r, q) } : r)));
  };

  const canDesfazer = selectedRows.some((r) => r.grupo && (grupoCount.get(r.grupo) || 0) > 1);

  return (
    <div className="space-y-2 border rounded-md p-2">
      <div className="text-[11px] font-semibold flex items-center gap-1.5">
        <Split className="h-3.5 w-3.5" /> Itens da Despesa / Rateio por Veículo
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="h-8 text-xs flex-1 min-w-[160px]" placeholder="Descrição do item / peça"
          value={novoDesc} onChange={(e) => onNovoChange({ desc: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
        />
        <Input
          className="h-8 text-xs w-20 text-right" inputMode="decimal" placeholder="Qtd"
          value={novoQtd} onChange={(e) => onNovoChange({ qtd: e.target.value })}
        />
        <Input
          className="h-8 text-xs w-28 text-right" inputMode="numeric" placeholder="Unit. 0,00"
          value={novoValor} onChange={(e) => onNovoChange({ valor: maskCurrency(e.target.value) })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={addItem}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {itens.length > 0 && (
        <>
          <GlobalToolbar
            selectedCount={selectedRows.length}
            actions={[
              { key: "split", label: "Desmembrar", icon: Split, mode: "single", onClick: splitSelected, disabled: selectedRows.length !== 1 },
              { key: "undo", label: "Desfazer desmembramento", icon: Undo2, mode: "single+batch", onClick: undoSplit, disabled: !canDesfazer },
              { key: "remove", label: "Remover item", icon: Trash2, mode: "single+batch", variant: "destructive", onClick: removeSelected },
            ]}
          >
            <span className="text-[11px] text-muted-foreground">
              Selecione uma linha para desmembrar entre placas
            </span>
          </GlobalToolbar>

          <div className="border rounded-md">
            <ScrollArea className="max-h-56">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[10px]">Item</TableHead>
                    <TableHead className="text-[10px] w-20 text-right">Qtd</TableHead>
                    <TableHead className="text-[10px] w-24 text-right">Unit.</TableHead>
                    <TableHead className="text-[10px] w-24 text-right">Total</TableHead>
                    <TableHead className="text-[10px] w-40">Veículo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it) => {
                    const desmembrado = !!it.grupo && (grupoCount.get(it.grupo) || 0) > 1;
                    const selected = selectedUids.includes(it.uid);
                    return (
                      <TableRow
                        key={it.uid}
                        data-state={selected ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => toggle(it.uid)}
                      >
                        <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected} onCheckedChange={() => toggle(it.uid)} />
                        </TableCell>
                        <TableCell className="text-[11px] py-1">
                          {desmembrado && <span className="mr-1 text-muted-foreground">↳</span>}
                          {it.descricao}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                          {desmembrado ? (
                            <Input
                              className="h-6 text-[11px] text-right px-1" inputMode="decimal"
                              value={String(it.quantidade)} onChange={(e) => updateQtd(it.uid, e.target.value)}
                            />
                          ) : (
                            it.quantidade
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums">{formatCurrency(it.valor_unitario)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums">{formatCurrency(it.valor_total)}</TableCell>
                        <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={it.veiculo_id || "__none__"}
                            onValueChange={(v) =>
                              onChange(itens.map((r) => (r.uid === it.uid ? { ...r, veiculo_id: v === "__none__" ? null : v } : r)))
                            }
                          >
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-xs">— sem veículo —</SelectItem>
                              {vehicles.map((v) => (
                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                  {v.plate}{v.model ? ` • ${v.model}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="px-2 py-1 border-t text-[11px] flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                Soma dos itens: <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
              </span>
              {Math.abs(diff) < 0.01 ? (
                <span className="text-success inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> confere com o valor do lançamento
                </span>
              ) : (
                <span className="text-destructive inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  diferença de {formatCurrency(Math.abs(diff))} em relação ao valor do lançamento ({formatCurrency(valorAlvo)})
                </span>
              )}
            </div>
            {invalidos.length > 0 && (
              <div className="px-2 py-1 border-t text-[10px] text-destructive inline-flex flex-wrap items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {invalidos.map((g) => `${g.desc}: soma ${g.soma} ≠ quantidade original ${g.original}`).join(" • ")}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
