import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Plus, Trash2, AlertTriangle, Split } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { parseNfeXml, type NfeItem, type NfeDuplicata } from "@/lib/nfeXmlParser";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";
import { PlanoContasCombobox } from "./PlanoContasCombobox";
import { type RateioVehicleOption } from "./VehicleRateioEditor";
import { type RateioRow } from "@/lib/rateio";

export interface FiscalChartAccount {
  id: string; codigo: string; nome: string; tipo: string;
  conta_pai_id: string | null; centro_custo_default?: string | null;
}

export interface FiscalDocResult {
  tipo: "nfe" | "nfse";
  numero: string;
  chave: string | null;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  data_emissao: string;
  descricao: string;
  valor_total: number;
  valor_parcela: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  itens: Array<{
    descricao: string; quantidade: number; valor_unitario: number; valor_total: number;
    veiculo_id?: string | null;
    /** Identificador do item original da nota (linhas desmembradas compartilham o grupo) */
    grupo?: string;
    /** Quantidade original do item no XML (para validar o desmembramento) */
    qtd_original?: number;
    /** Valor total original do item no XML (base para rateio proporcional) */
    total_original?: number;
  }>;
  parcelas: NfeDuplicata[];
  xml_original: string | null;
  plano_contas_id: string | null;
  centro_custo: string;
  expandir: boolean;
  /** Rateio do valor da parcela entre veículos, calculado a partir dos itens (opcional) */
  rateio: RateioRow[] | null;
}

const CENTRO_CUSTO_OPTIONS = [
  { value: "frota_propria", label: "Frota Própria" },
  { value: "frota_terceiros", label: "Frota Terceiros" },
  { value: "administrativo", label: "Administrativo" },
  { value: "operacional", label: "Operacional" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chartAccounts: FiscalChartAccount[];
  /** Data padrão do lançamento (competência da fatura) */
  defaultDate?: string;
  /** Quando informado, o diálogo entra em modo "anexar" a um lançamento já existente (OFX) */
  attachMode?: boolean;
  attachDescription?: string;
  attachAmount?: number;
  /** Veículos disponíveis para rateio (frota própria) */
  vehicles?: RateioVehicleOption[];
  onConfirm: (data: FiscalDocResult) => void;
}

export function FiscalDocImportDialog({
  open, onOpenChange, chartAccounts, defaultDate, attachMode, attachDescription, attachAmount, vehicles = [], onConfirm,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isNfse, setIsNfse] = useState(false);

  const [numero, setNumero] = useState("");
  const [chave, setChave] = useState<string | null>(null);
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [fornecedorCnpj, setFornecedorCnpj] = useState("");
  const [dataEmissao, setDataEmissao] = useState(defaultDate || getLocalDateISO());
  const [descricao, setDescricao] = useState("");
  const [valorTotalStr, setValorTotalStr] = useState("");
  const [itens, setItens] = useState<FiscalDocResult["itens"]>([]);
  const [parcelas, setParcelas] = useState<NfeDuplicata[]>([]);
  const [xmlOriginal, setXmlOriginal] = useState<string | null>(null);
  const [planoContasId, setPlanoContasId] = useState<string | null>(null);
  const [centroCusto, setCentroCusto] = useState("");
  const [parcelaAtual, setParcelaAtual] = useState("1");
  const [parcelaTotal, setParcelaTotal] = useState("1");
  const [expandir, setExpandir] = useState(true);
  const [xmlLoaded, setXmlLoaded] = useState(false);

  // Campos de item manual (NFS-e)
  const [novoItemDesc, setNovoItemDesc] = useState("");
  const [novoItemValor, setNovoItemValor] = useState("");

  useEffect(() => {
    if (!open) return;
    setIsNfse(false);
    setNumero(""); setChave(null); setFornecedorNome(""); setFornecedorCnpj("");
    setDataEmissao(defaultDate || getLocalDateISO());
    setDescricao(attachMode ? (attachDescription || "") : "");
    setValorTotalStr(attachMode && attachAmount ? maskCurrency(String(Math.round(attachAmount * 100))) : "");
    setItens([]); setParcelas([]); setXmlOriginal(null);
    setPlanoContasId(null); setCentroCusto("");
    setParcelaAtual("1"); setParcelaTotal("1"); setExpandir(true); setXmlLoaded(false);
    setNovoItemDesc(""); setNovoItemValor("");
  }, [open, defaultDate, attachMode, attachDescription, attachAmount]);

  const valorTotal = Number(unmaskCurrency(valorTotalStr)) || 0;
  const itensTotal = useMemo(() => itens.reduce((s, i) => s + i.valor_total, 0), [itens]);

  const nParcelas = Math.max(1, Number(parcelaTotal) || 1);
  const valorParcela = useMemo(() => {
    if (parcelas.length > 0) {
      const idx = Math.min(Math.max(Number(parcelaAtual) || 1, 1), parcelas.length) - 1;
      return parcelas[idx]?.valor || valorTotal / nParcelas;
    }
    return valorTotal / nParcelas;
  }, [parcelas, parcelaAtual, valorTotal, nParcelas]);

  /**
   * Rateio automático por veículo: proporcional ao peso de cada item (já com impostos)
   * sobre o valor lançado nesta fatura. Invisível ao usuário.
   */
  const rateioItens = useMemo<RateioRow[]>(() => {
    const comVeiculo = itens.filter((i) => i.veiculo_id);
    if (comVeiculo.length === 0 || itensTotal <= 0) return [];
    const base = Number(valorParcela.toFixed(2));
    const porVeiculo = new Map<string, number>();
    for (const it of comVeiculo) {
      const key = it.veiculo_id as string;
      porVeiculo.set(key, (porVeiculo.get(key) || 0) + it.valor_total);
    }
    const entries = [...porVeiculo.entries()];
    const somaAtribuida = entries.reduce((s, [, v]) => s + v, 0);
    const totalCents = Math.round(base * 100 * (somaAtribuida / itensTotal));
    let acc = 0;
    return entries.map(([veiculo_id, valor], idx) => {
      const cents = idx === entries.length - 1
        ? totalCents - acc
        : Math.round((valor / somaAtribuida) * totalCents);
      acc += cents;
      return {
        veiculo_id,
        valor_rateado: cents / 100,
        percentual: base ? (cents / 100 / base) * 100 : null,
      };
    });
  }, [itens, itensTotal, valorParcela]);

  /** Grupos desmembrados cuja soma de quantidades não bate com a quantidade original */
  const gruposInvalidos = useMemo(() => {
    const map = new Map<string, { desc: string; soma: number; original: number }>();
    for (const it of itens) {
      if (!it.grupo || it.qtd_original == null) continue;
      const cur = map.get(it.grupo) || { desc: it.descricao, soma: 0, original: it.qtd_original };
      cur.soma += Number(it.quantidade) || 0;
      map.set(it.grupo, cur);
    }
    return [...map.values()].filter((g) => Math.abs(g.soma - g.original) > 0.0001);
  }, [itens]);

  const splitItem = (idx: number) => {
    setItens((prev) => {
      const it = prev[idx];
      if (!it) return prev;
      const grupo = it.grupo || `g${idx}-${Date.now()}`;
      const qtdOriginal = it.qtd_original ?? it.quantidade;
      const totalOriginal = it.total_original ?? it.valor_total;
      const qA = Number((it.quantidade / 2).toFixed(4));
      const qB = Number((it.quantidade - qA).toFixed(4));
      const ratio = (q: number) => (qtdOriginal ? Number(((totalOriginal * q) / qtdOriginal).toFixed(2)) : 0);
      const base = { ...it, grupo, qtd_original: qtdOriginal, total_original: totalOriginal };
      const linhaA = { ...base, quantidade: qA, valor_total: ratio(qA) };
      const linhaB = { ...base, quantidade: qB, valor_total: ratio(qB), veiculo_id: null };
      return [...prev.slice(0, idx), linhaA, linhaB, ...prev.slice(idx + 1)];
    });
  };

  const updateQuantidade = (idx: number, raw: string) => {
    const q = Number(raw.replace(",", ".")) || 0;
    setItens((prev) =>
      prev.map((r, j) => {
        if (j !== idx) return r;
        const qtdOriginal = r.qtd_original ?? r.quantidade;
        const totalOriginal = r.total_original ?? r.valor_total;
        return {
          ...r,
          quantidade: q,
          valor_total: qtdOriginal ? Number(((totalOriginal * q) / qtdOriginal).toFixed(2)) : 0,
        };
      }),
    );
  };


  const handleXmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseNfeXml(ev.target?.result as string);
        setNumero(parsed.numero_nota || "");
        setChave(parsed.chave_nfe || null);
        setFornecedorNome(parsed.fornecedor_nome || "");
        setFornecedorCnpj(parsed.fornecedor_cnpj || "");
        if (parsed.data_emissao) setDataEmissao(parsed.data_emissao);
        setValorTotalStr(maskCurrency(String(Math.round((parsed.valor_total || 0) * 100))));
        setItens((parsed.itens || []).map((i: NfeItem, ix: number) => ({
          descricao: i.descricao, quantidade: i.quantidade,
          valor_unitario: i.valor_unitario, valor_total: i.valor_total, veiculo_id: null,
          grupo: `x${ix}`, qtd_original: i.quantidade, total_original: i.valor_total,
        })));
        setParcelas(parsed.duplicatas || []);
        setXmlOriginal(parsed.xml_original || null);
        setXmlLoaded(true);
        const nDup = (parsed.duplicatas || []).length;
        setParcelaTotal(String(Math.max(1, nDup)));
        setParcelaAtual("1");
        if (!attachMode) {
          const base = parsed.itens?.[0]?.descricao || parsed.fornecedor_nome || "";
          setDescricao(`${base}${parsed.numero_nota ? ` - NF ${parsed.numero_nota}` : ""}`.slice(0, 120));
        }
        toast.success(`XML importado: ${parsed.itens.length} item(ns)${nDup ? `, ${nDup} parcela(s)` : ""}.`);
      } catch (err: any) {
        toast.error(err.message || "Erro ao processar XML.");
      }
    };
    reader.readAsText(file, "ISO-8859-1");
    e.target.value = "";
  };

  const addItemManual = () => {
    const d = novoItemDesc.trim();
    const v = Number(unmaskCurrency(novoItemValor)) || 0;
    if (!d || v <= 0) { toast.error("Informe descrição e valor do serviço."); return; }
    setItens((prev) => [...prev, {
      descricao: d, quantidade: 1, valor_unitario: v, valor_total: v, veiculo_id: null,
      grupo: `m${Date.now()}`, qtd_original: 1, total_original: v,
    }]);
    setNovoItemDesc(""); setNovoItemValor("");
  };

  const handleConfirm = () => {
    if (gruposInvalidos.length > 0) { toast.error("As quantidades desmembradas não conferem com o item original."); return; }
    if (!descricao.trim()) { toast.error("Informe a descrição do lançamento."); return; }
    if (valorTotal <= 0) { toast.error("Informe o valor total do documento."); return; }
    if (isNfse && !numero.trim()) { toast.error("Informe o número da NFS-e."); return; }
    if (!isNfse && !xmlLoaded && !numero.trim()) { toast.error("Importe o XML da NF-e ou informe o número da nota."); return; }
    const total = Math.max(1, Number(parcelaTotal) || 1);
    const atual = Math.min(Math.max(Number(parcelaAtual) || 1, 1), total);
    if (!attachMode && total > 1 && expandir) {
      if (!planoContasId) { toast.error("Selecione o plano de contas para lançar as parcelas nas faturas."); return; }
      if (!centroCusto) { toast.error("Selecione o centro de custo para lançar as parcelas nas faturas."); return; }
    }
    onConfirm({
      tipo: isNfse ? "nfse" : "nfe",
      numero: numero.trim(),
      chave,
      fornecedor_nome: fornecedorNome.trim(),
      fornecedor_cnpj: fornecedorCnpj.trim(),
      data_emissao: dataEmissao,
      descricao: descricao.trim(),
      valor_total: valorTotal,
      valor_parcela: Number(valorParcela.toFixed(2)),
      parcela_atual: total > 1 ? atual : null,
      parcela_total: total > 1 ? total : null,
      itens,
      parcelas,
      xml_original: xmlOriginal,
      plano_contas_id: planoContasId,
      centro_custo: centroCusto,
      expandir: total > 1 && expandir && !attachMode,
      rateio: rateioItens.length > 0 ? rateioItens : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {attachMode ? "Vincular Nota Fiscal ao Lançamento" : "Nova Despesa do Cartão com Nota Fiscal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={handleXmlFile} />
            <Button
              type="button" variant="outline" size="sm" className="h-9 text-xs"
              onClick={() => fileRef.current?.click()} disabled={isNfse}
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Importar XML (NF-e)
            </Button>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={isNfse} onCheckedChange={(v) => setIsNfse(!!v)} />
              Possui Nota de Serviço (NFS-e)
            </label>
            {xmlLoaded && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> NF {numero} • {formatCurrency(valorTotal)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="md:col-span-1">
              <Label className="text-[11px]">{isNfse ? "Nº NFS-e" : "Nº NF-e"}</Label>
              <Input className="h-9 text-xs" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px]">Fornecedor</Label>
              <Input className="h-9 text-xs" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">CNPJ</Label>
              <Input className="h-9 text-xs" value={fornecedorCnpj} onChange={(e) => setFornecedorCnpj(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Emissão</Label>
              <Input type="date" className="h-9 text-xs" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px]">Descrição do lançamento</Label>
              <Input className="h-9 text-xs" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Valor total do documento</Label>
              <Input
                className="h-9 text-xs text-right" inputMode="numeric"
                value={valorTotalStr} onChange={(e) => setValorTotalStr(maskCurrency(e.target.value))}
              />
            </div>
          </div>

          {isNfse && (
            <div className="border rounded-md p-2 space-y-2">
              <div className="text-[11px] font-medium">Serviços da NFS-e</div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-xs" placeholder="Descrição do serviço"
                  value={novoItemDesc} onChange={(e) => setNovoItemDesc(e.target.value)}
                />
                <Input
                  className="h-8 text-xs w-32 text-right" inputMode="numeric" placeholder="0,00"
                  value={novoItemValor} onChange={(e) => setNovoItemValor(maskCurrency(e.target.value))}
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={addItemManual}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {itens.length > 0 && (
            <div className="border rounded-md">
              <ScrollArea className="max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Item</TableHead>
                      <TableHead className="text-[10px] w-20 text-right">Qtd</TableHead>
                      <TableHead className="text-[10px] w-28 text-right">Unit.</TableHead>
                      <TableHead className="text-[10px] w-28 text-right">Total</TableHead>
                      {vehicles.length > 0 && <TableHead className="text-[10px] w-40">Veículo</TableHead>}
                      {isNfse && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((it, i) => {
                      const desmembrado = !!it.grupo && itens.filter((r) => r.grupo === it.grupo).length > 1;
                      return (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] py-1">
                          {it.descricao}
                          {desmembrado && <span className="ml-1 text-[9px] text-muted-foreground">(desmembrado)</span>}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums">
                          {desmembrado ? (
                            <Input
                              className="h-6 text-[11px] text-right px-1"
                              inputMode="decimal"
                              value={String(it.quantidade)}
                              onChange={(e) => updateQuantidade(i, e.target.value)}
                            />
                          ) : (
                            it.quantidade
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums">{formatCurrency(it.valor_unitario)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums">{formatCurrency(it.valor_total)}</TableCell>
                        {vehicles.length > 0 && (
                          <TableCell className="py-1">
                            <div className="flex items-center gap-1">
                              <Select
                                value={it.veiculo_id || "__none__"}
                                onValueChange={(v) =>
                                  setItens((prev) => prev.map((r, j) => (j === i ? { ...r, veiculo_id: v === "__none__" ? null : v } : r)))
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
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                                      onClick={() => splitItem(i)}
                                    >
                                      <Split className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">Desmembrar item para múltiplos veículos</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {desmembrado && (
                                <Button
                                  type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                                  title="Remover esta sub-linha"
                                  onClick={() => setItens((prev) => prev.filter((_, j) => j !== i))}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {isNfse && (
                          <TableCell className="py-1">
                            <Button
                              type="button" variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => setItens((prev) => prev.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
              <div className="px-2 py-1 text-[11px] text-muted-foreground border-t">
                Soma dos itens: <span className="font-semibold text-foreground">{formatCurrency(itensTotal)}</span>
                {Math.abs(itensTotal - valorTotal) > 0.01 && (
                  <span className="ml-2 text-warning inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> diverge do total do documento
                  </span>
                )}
                <span className="ml-2">(valores já com IPI, ST, frete, seguro e descontos)</span>
              </div>
              {gruposInvalidos.length > 0 && (
                <div className="px-2 py-1 text-[10px] text-destructive border-t inline-flex flex-wrap items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {gruposInvalidos.map((g) => `${g.desc}: soma ${g.soma} ≠ quantidade original ${g.original}`).join(" • ")}
                </div>
              )}
              {rateioItens.length > 0 && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground border-t">
                  Rateio automático por veículo:{" "}
                  {rateioItens.map((r) => {
                    const v = vehicles.find((x) => x.id === r.veiculo_id);
                    return `${v?.plate || "?"} ${formatCurrency(r.valor_rateado)} (${(r.percentual || 0).toFixed(1)}%)`;
                  }).join(" • ")}
                </div>
              )}
            </div>
          )}

          {!attachMode && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border-t pt-3">
              <div>
                <Label className="text-[11px]">Parcela atual</Label>
                <Input className="h-9 text-xs" inputMode="numeric" value={parcelaAtual} onChange={(e) => setParcelaAtual(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <Label className="text-[11px]">Total de parcelas</Label>
                <Input className="h-9 text-xs" inputMode="numeric" value={parcelaTotal} onChange={(e) => setParcelaTotal(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[11px]">Plano de Contas</Label>
                <PlanoContasCombobox
                  value={planoContasId}
                  onChange={(v) => {
                    setPlanoContasId(v);
                    const acc = chartAccounts.find((a) => a.id === v);
                    if (acc?.centro_custo_default && !centroCusto) setCentroCusto(acc.centro_custo_default);
                  }}
                  options={chartAccounts as any}
                  size="sm"
                  placeholder="Selecionar..."
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[11px]">Centro de Custo</Label>
                <Select value={centroCusto || undefined} onValueChange={setCentroCusto}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {CENTRO_CUSTO_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-end">
                <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                  <Checkbox
                    checked={expandir}
                    disabled={nParcelas < 2}
                    onCheckedChange={(v) => setExpandir(!!v)}
                    className="mt-0.5"
                  />
                  <span>
                    Lançar as parcelas nas faturas do cartão (mês a mês).
                    <span className="block text-muted-foreground">
                      A dívida fica na fatura do cartão — não gera títulos no Contas a Pagar.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {!attachMode && (
            <div className="text-[11px] text-muted-foreground">
              Valor lançado nesta fatura: <span className="font-semibold text-foreground">{formatCurrency(valorParcela)}</span>
              {nParcelas > 1 && ` • ${nParcelas}x de ${formatCurrency(valorTotal / nParcelas)} (total ${formatCurrency(valorTotal)})`}
            </div>
          )}

        </div>


        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleConfirm} disabled={gruposInvalidos.length > 0}>
            {attachMode ? "Vincular nota" : "Adicionar à fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
