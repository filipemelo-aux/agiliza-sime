import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { maskName, maskSentence, maskCurrency, unmaskCurrency, maskUf } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { CargaSearchInput } from "@/components/freight/CargaSearchInput";

interface Props {
  type: "frete" | "colheita";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  establishments: any[];
  userId: string;
  onSaved: () => void;
  editData?: any | null;
}

export function QuotationFormDialog({ type, open, onOpenChange, establishments, userId, onSaved, editData }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formalizing, setFormalizing] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [establishmentId, setEstablishmentId] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [validadeDias, setValidadeDias] = useState(15);

  // Freight fields
  const [origemCidade, setOrigemCidade] = useState("");
  const [origemUf, setOrigemUf] = useState("");
  const [destinoCidade, setDestinoCidade] = useState("");
  const [destinoUf, setDestinoUf] = useState("");
  const [cargaId, setCargaId] = useState<string | null>(null);
  const [produto, setProduto] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [valorFrete, setValorFrete] = useState("");
  const [tipoValorFrete, setTipoValorFrete] = useState<"total" | "por_tonelada">("total");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [formaPagamentoFrete, setFormaPagamentoFrete] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [adiantamentoPercentual, setAdiantamentoPercentual] = useState("");

  // Harvest fields
  const [previsaoInicio, setPrevisaoInicio] = useState("");
  const [previsaoTermino, setPrevisaoTermino] = useState("");
  const [valorMensal, setValorMensal] = useState("");
  const [qtdCaminhoes, setQtdCaminhoes] = useState("1");
  const [alimentacaoPorConta, setAlimentacaoPorConta] = useState("contratada");
  const [combustivelPorConta, setCombustivelPorConta] = useState("contratada");
  const [valorAlimentacaoDia, setValorAlimentacaoDia] = useState("");

  const handleFormalize = async () => {
    if (!observacoes.trim()) {
      toast({ title: "Digite algo nas observações antes de formalizar", variant: "destructive" });
      return;
    }
    setFormalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("formalize-text", {
        body: { text: observacoes, businessType: type },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
      } else if (data?.text) {
        setObservacoes(data.text);
        toast({ title: "Texto formalizado com sucesso" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao formalizar texto", description: e.message, variant: "destructive" });
    } finally {
      setFormalizing(false);
    }
  };

  const diaria = valorMensal ? (parseFloat(valorMensal) / 30) : 0;

  // Populate fields when editing
  useEffect(() => {
    if (editData) {
      setEstablishmentId(editData.establishment_id || "");
      setClientId(editData.client_id || null);
      setClientName(editData.client?.razao_social || editData.client?.full_name || "");
      setObservacoes(editData.observacoes || "");
      setValidadeDias(editData.validade_dias || 15);

      if (type === "frete") {
        setOrigemCidade(editData.origem_cidade || "");
        setOrigemUf(editData.origem_uf || "");
        setDestinoCidade(editData.destino_cidade || "");
        setDestinoUf(editData.destino_uf || "");
        setCargaId(editData.carga_id || null);
        setProduto(editData.produto || "");
        setPesoKg(editData.peso_kg != null ? String(editData.peso_kg) : "");
        setValorFrete(editData.valor_frete != null ? String(editData.valor_frete) : "");
        setTipoValorFrete(editData.tipo_valor_frete || "total");
        setCondicoesPagamento(editData.condicoes_pagamento || "");
        setFormaPagamentoFrete(editData.forma_pagamento_frete || "");
        setPrazoPagamento(editData.prazo_pagamento || "");
        setAdiantamentoPercentual(editData.adiantamento_percentual != null ? String(editData.adiantamento_percentual) : "");
      } else {
        setPrevisaoInicio(editData.previsao_inicio || "");
        setPrevisaoTermino(editData.previsao_termino || "");
        setValorMensal(editData.valor_mensal_por_caminhao != null ? String(editData.valor_mensal_por_caminhao) : "");
        setQtdCaminhoes(editData.quantidade_caminhoes != null ? String(editData.quantidade_caminhoes) : "1");
        setAlimentacaoPorConta(editData.alimentacao_por_conta || "contratada");
        setCombustivelPorConta(editData.combustivel_por_conta || "contratada");
        setValorAlimentacaoDia(editData.valor_alimentacao_dia != null ? String(editData.valor_alimentacao_dia) : "");
      }
    } else if (establishments.length > 0) {
      const matriz = establishments.find((e: any) => e.type === "matriz" || e.tipo === "matriz");
      setEstablishmentId(matriz?.id || establishments[0].id);
    }
  }, [editData, establishments]);

  const handleSave = async () => {
    if (!establishmentId) { toast({ title: "Selecione a empresa contratada", variant: "destructive" }); return; }

    setSaving(true);
    const base: any = {
      type,
      establishment_id: establishmentId,
      client_id: clientId,
      observacoes: observacoes || null,
      validade_dias: validadeDias,
    };

    if (!editData) {
      base.created_by = userId;
    }

    if (type === "frete") {
      if (!origemCidade || !destinoCidade) { toast({ title: "Preencha origem e destino", variant: "destructive" }); setSaving(false); return; }
      Object.assign(base, {
        origem_cidade: origemCidade,
        origem_uf: origemUf,
        destino_cidade: destinoCidade,
        destino_uf: destinoUf,
        carga_id: cargaId,
        produto,
        peso_kg: pesoKg ? parseFloat(pesoKg) : null,
        valor_frete: valorFrete ? parseFloat(valorFrete) : null,
        tipo_valor_frete: tipoValorFrete,
        condicoes_pagamento: condicoesPagamento || null,
        forma_pagamento_frete: formaPagamentoFrete || null,
        prazo_pagamento: prazoPagamento || null,
        adiantamento_percentual: adiantamentoPercentual ? parseFloat(adiantamentoPercentual) : null,
      });
    } else {
      if (!previsaoInicio || !valorMensal) { toast({ title: "Preencha o período e valor mensal", variant: "destructive" }); setSaving(false); return; }
      Object.assign(base, {
        previsao_inicio: previsaoInicio,
        previsao_termino: previsaoTermino || null,
        valor_mensal_por_caminhao: parseFloat(valorMensal),
        quantidade_caminhoes: parseInt(qtdCaminhoes) || 1,
        alimentacao_por_conta: alimentacaoPorConta,
        combustivel_por_conta: combustivelPorConta,
        valor_alimentacao_dia: alimentacaoPorConta === "contratante" && valorAlimentacaoDia ? parseFloat(valorAlimentacaoDia) : null,
      });
    }

    let error;
    if (editData) {
      ({ error } = await supabase.from("quotations").update(base).eq("id", editData.id));
    } else {
      ({ error } = await supabase.from("quotations").insert(base));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editData ? "Cotação atualizada com sucesso" : "Cotação criada com sucesso" });
      onOpenChange(false);
      onSaved();
    }
  };

  const isEditing = !!editData;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `Editar Cotação #${editData.numero}`
              : type === "frete" ? "Nova Cotação de Frete" : "Nova Cotação de Colheita"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Empresa contratada - unified */}
          <div>
            <Label>Empresa Contratada (Emitente)</Label>
            <Input value="Sime Transporte Ltda" disabled className="bg-muted/30" />
          </div>

          {/* Cliente */}
          <div>
            <Label>Cliente (Destinatário da Cotação)</Label>
            <PersonSearchInput
              categories={["cliente", "fornecedor", "proprietario"]}
              placeholder="Buscar cliente cadastrado..."
              selectedName={clientName}
              onSelect={(p) => { setClientId(p.id); setClientName(p.full_name); }}
              onClear={() => { setClientId(null); setClientName(""); }}
              endAction={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Cadastrar novo cliente"
                  onClick={() => setShowCreateClient(true)}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              }
            />
          </div>

          {type === "frete" ? (
            <>
              {/* Origem */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cidade Origem</Label>
                  <Input value={origemCidade} onChange={(e) => setOrigemCidade(maskName(e.target.value))} placeholder="Ex: Uberlândia" />
                </div>
                <div>
                  <Label>UF Origem</Label>
                  <Input value={origemUf} onChange={(e) => setOrigemUf(maskUf(e.target.value))} placeholder="MG" maxLength={2} />
                </div>
              </div>

              {/* Destino */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cidade Destino</Label>
                  <Input value={destinoCidade} onChange={(e) => setDestinoCidade(maskName(e.target.value))} placeholder="Ex: Santos" />
                </div>
                <div>
                  <Label>UF Destino</Label>
                  <Input value={destinoUf} onChange={(e) => setDestinoUf(maskUf(e.target.value))} placeholder="SP" maxLength={2} />
                </div>
              </div>

              {/* Carga */}
              <div>
                <Label>Tipo de Mercadoria</Label>
                <CargaSearchInput
                  placeholder="Buscar mercadoria cadastrada..."
                  selectedName={produto}
                  onSelect={(c) => {
                    setCargaId(c.id);
                    setProduto(c.produto_predominante);
                    if (c.peso_bruto) setPesoKg(String(c.peso_bruto));
                  }}
                  onClear={() => { setCargaId(null); setProduto(""); }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Peso Total (kg)</Label>
                  <Input type="number" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Valor do Frete (R$)</Label>
                  <Input value={valorFrete ? maskCurrency(String(Math.round(parseFloat(valorFrete) * 100))) : ""} onChange={(e) => setValorFrete(unmaskCurrency(e.target.value))} placeholder="0,00" />
                </div>
                <div>
                  <Label>Tipo do Valor</Label>
                  <Select value={tipoValorFrete} onValueChange={(v) => setTipoValorFrete(v as "total" | "por_tonelada")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total">Frete Total</SelectItem>
                      <SelectItem value="por_tonelada">Por Tonelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Condições de Pagamento</Label>
                <Input
                  value={condicoesPagamento}
                  onChange={(e) => setCondicoesPagamento(maskSentence(e.target.value))}
                  placeholder="Ex: 30/60 dias após entrega, à vista, etc."
                />
              </div>
            </>
          ) : (
            <>
              {/* Colheita */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Previsão de Início</Label>
                  <Input type="date" value={previsaoInicio} onChange={(e) => setPrevisaoInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Previsão de Término</Label>
                  <Input type="date" value={previsaoTermino} onChange={(e) => setPrevisaoTermino(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Qtd. Caminhões</Label>
                  <Input type="number" value={qtdCaminhoes} onChange={(e) => setQtdCaminhoes(e.target.value)} min={1} />
                </div>
                <div>
                  <Label>Valor Mensal por Caminhão (R$)</Label>
                  <Input value={valorMensal ? maskCurrency(String(Math.round(parseFloat(valorMensal) * 100))) : ""} onChange={(e) => setValorMensal(unmaskCurrency(e.target.value))} placeholder="0,00" />
                </div>
              </div>

              {valorMensal && (
                <div className="bg-muted/50 border border-border rounded-md p-3">
                  <p className="text-sm text-muted-foreground">Valor da diária por caminhão (automático):</p>
                  <p className="text-lg font-semibold">{diaria.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Alimentação por conta de</Label>
                  <Select value={alimentacaoPorConta} onValueChange={setAlimentacaoPorConta}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contratada">Contratada (SIME)</SelectItem>
                      <SelectItem value="contratante">Contratante (Cliente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Combustível por conta de</Label>
                  <Select value={combustivelPorConta} onValueChange={setCombustivelPorConta}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contratada">Contratada (SIME)</SelectItem>
                      <SelectItem value="contratante">Contratante (Cliente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {alimentacaoPorConta === "contratante" && (
                <div>
                  <Label>Valor da Alimentação por Dia (R$)</Label>
                  <Input value={valorAlimentacaoDia ? maskCurrency(String(Math.round(parseFloat(valorAlimentacaoDia) * 100))) : ""} onChange={(e) => setValorAlimentacaoDia(unmaskCurrency(e.target.value))} placeholder="0,00" />
                </div>
              )}
            </>
          )}

          {/* Observações e validade */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Observações</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleFormalize}
                  disabled={formalizing || !observacoes.trim()}
                >
                  {formalizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Formalizar com IA
                </Button>
              </div>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(maskSentence(e.target.value))} rows={3} placeholder="Digite suas observações e clique em 'Formalizar com IA' para reescrever formalmente..." />
            </div>
            <div>
              <Label>Validade (dias)</Label>
              <Input type="number" value={validadeDias} onChange={(e) => setValidadeDias(parseInt(e.target.value) || 15)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEditing ? "Salvar Alterações" : "Salvar Cotação"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <PersonCreateDialog
      open={showCreateClient}
      onOpenChange={setShowCreateClient}
      onCreated={async () => {
        // Fetch latest created client profile
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("category", "cliente")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (data) {
          setClientId(data.id);
          setClientName(data.full_name);
        }
      }}
      defaultCategory="cliente"
    />
    </>
  );
}
