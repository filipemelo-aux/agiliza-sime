import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { toast } from "sonner";

const TIPO_DESPESA_OPTIONS = [
  { value: "combustivel", label: "Combustível" },
  { value: "manutencao", label: "Manutenção" },
  { value: "pedagio", label: "Pedágio" },
  { value: "multa", label: "Multa" },
  { value: "administrativo", label: "Administrativo" },
  { value: "frete_terceiro", label: "Frete Terceiro" },
  { value: "imposto", label: "Imposto" },
  { value: "outros", label: "Outros" },
];

const CENTRO_CUSTO_OPTIONS = [
  { value: "frota_propria", label: "Frota Própria" },
  { value: "frota_terceiros", label: "Frota Terceiros" },
  { value: "administrativo", label: "Administrativo" },
  { value: "operacional", label: "Operacional" },
];

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  descricao: string;
  tipo_despesa: string;
  categoria_financeira_id: string | null;
  centro_custo: string;
  valor_total: number;
  valor_pago: number;
  data_emissao: string;
  data_vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  observacoes: string | null;
  veiculo_placa: string | null;
  litros: number | null;
  km_odometro: number | null;
  numero_multa: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  empresaId: string;
  categories: Category[];
  onSaved: () => void;
}

export function ExpenseFormDialog({ open, onOpenChange, expense, empresaId, categories, onSaved }: Props) {
  const { user } = useAuth();

  const [descricao, setDescricao] = useState("");
  const [tipoDespesa, setTipoDespesa] = useState("outros");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroCusto, setCentroCusto] = useState("operacional");
  const [valorTotal, setValorTotal] = useState("");
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split("T")[0]);
  const [dataVencimento, setDataVencimento] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [favorecidoNome, setFavorecidoNome] = useState("");
  const [favorecidoId, setFavorecidoId] = useState<string | null>(null);
  const [docFiscal, setDocFiscal] = useState("");
  const [chaveNfe, setChaveNfe] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [litros, setLitros] = useState("");
  const [kmOdometro, setKmOdometro] = useState("");
  const [numeroMulta, setNumeroMulta] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setDescricao(expense.descricao);
      setTipoDespesa(expense.tipo_despesa);
      setCategoriaId(expense.categoria_financeira_id || "");
      setCentroCusto(expense.centro_custo);
      setValorTotal(String(expense.valor_total));
      setDataEmissao(expense.data_emissao);
      setDataVencimento(expense.data_vencimento || "");
      setFormaPagamento(expense.forma_pagamento || "");
      setFavorecidoNome(expense.favorecido_nome || "");
      setFavorecidoId(expense.favorecido_id || null);
      setDocFiscal(expense.documento_fiscal_numero || "");
      setChaveNfe(expense.chave_nfe || "");
      setObservacoes(expense.observacoes || "");
      setVeiculoPlaca(expense.veiculo_placa || "");
      setLitros(expense.litros ? String(expense.litros) : "");
      setKmOdometro(expense.km_odometro ? String(expense.km_odometro) : "");
      setNumeroMulta(expense.numero_multa || "");
    } else {
      resetForm();
    }
  }, [expense, open]);

  const resetForm = () => {
    setDescricao("");
    setTipoDespesa("outros");
    setCategoriaId("");
    setCentroCusto("operacional");
    setValorTotal("");
    setDataEmissao(new Date().toISOString().split("T")[0]);
    setDataVencimento("");
    setFormaPagamento("");
    setFavorecidoNome("");
    setFavorecidoId(null);
    setDocFiscal("");
    setChaveNfe("");
    setObservacoes("");
    setVeiculoPlaca("");
    setLitros("");
    setKmOdometro("");
    setNumeroMulta("");
  };

  const handleSave = async () => {
    if (!descricao.trim()) return toast.error("Informe a descrição");
    if (!valorTotal || Number(valorTotal) <= 0) return toast.error("Informe o valor");

    setSaving(true);
    const payload: any = {
      empresa_id: empresaId,
      descricao: descricao.trim(),
      tipo_despesa: tipoDespesa,
      categoria_financeira_id: categoriaId || null,
      centro_custo: centroCusto,
      valor_total: Number(valorTotal),
      data_emissao: dataEmissao,
      data_vencimento: dataVencimento || null,
      forma_pagamento: formaPagamento || null,
      favorecido_nome: favorecidoNome.trim() || null,
      favorecido_id: favorecidoId || null,
      documento_fiscal_numero: docFiscal.trim() || null,
      chave_nfe: chaveNfe.trim() || null,
      origem: "manual",
      observacoes: observacoes.trim() || null,
      veiculo_placa: veiculoPlaca.trim() || null,
      litros: litros ? Number(litros) : null,
      km_odometro: kmOdometro ? Number(kmOdometro) : null,
      numero_multa: numeroMulta.trim() || null,
    };

    if (expense) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Despesa atualizada");
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Despesa criada");
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const showVehicleFields = ["combustivel", "manutencao", "pedagio", "multa"].includes(tipoDespesa);
  const showFuelFields = tipoDespesa === "combustivel";
  const showFineFields = tipoDespesa === "multa";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar" : "Nova"} Despesa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Tipo da Despesa */}
          <div>
            <Label>Tipo da Despesa *</Label>
            <Select value={tipoDespesa} onValueChange={setTipoDespesa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_DESPESA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div>
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Abastecimento ABC..." />
          </div>

          {/* Valor e Datas */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Emissão</Label>
              <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} />
            </div>
          </div>

          {/* Centro de Custo e Categoria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Centro de Custo</Label>
              <Select value={centroCusto} onValueChange={setCentroCusto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CENTRO_CUSTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Favorecido */}
          <div>
            <Label>Favorecido</Label>
            <PersonSearchInput
              categories={["fornecedor"]}
              placeholder="Buscar fornecedor..."
              selectedName={favorecidoNome || undefined}
              onSelect={p => { setFavorecidoNome(p.full_name); setFavorecidoId(p.id); }}
              onClear={() => { setFavorecidoNome(""); setFavorecidoId(null); }}
            />
          </div>

          {/* Forma de Pagamento */}
          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {FORMA_PAGAMENTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Documento Fiscal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nº Doc. Fiscal</Label>
              <Input value={docFiscal} onChange={e => setDocFiscal(e.target.value)} placeholder="Número NF/Recibo" />
            </div>
            <div>
              <Label>Chave NF-e</Label>
              <Input value={chaveNfe} onChange={e => setChaveNfe(e.target.value)} placeholder="44 dígitos" maxLength={44} />
            </div>
          </div>

          {/* Vehicle fields - conditional */}
          {showVehicleFields && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Placa Veículo</Label>
                <Input value={veiculoPlaca} onChange={e => setVeiculoPlaca(e.target.value)} placeholder="ABC1D23" />
              </div>
              <div>
                <Label>Km Odômetro</Label>
                <Input type="number" value={kmOdometro} onChange={e => setKmOdometro(e.target.value)} placeholder="0" />
              </div>
            </div>
          )}

          {/* Fuel fields */}
          {showFuelFields && (
            <div>
              <Label>Litros</Label>
              <Input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} placeholder="0,00" />
            </div>
          )}

          {/* Fine fields */}
          {showFineFields && (
            <div>
              <Label>Nº da Multa</Label>
              <Input value={numeroMulta} onChange={e => setNumeroMulta(e.target.value)} placeholder="Número do auto" />
            </div>
          )}

          {/* Observações */}
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
