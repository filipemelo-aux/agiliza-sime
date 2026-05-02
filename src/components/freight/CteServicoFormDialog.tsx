import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { Loader2, Users, Truck, Package, DollarSign, FileSignature } from "lucide-react";
import { maskCurrency, unmaskCurrency, maskName, maskPlate, unmaskPlate } from "@/lib/masks";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonSearchInput } from "./PersonSearchInput";
import { CargaSearchInput } from "./CargaSearchInput";
import { CteActorSection } from "./CteActorSection";
import { FreightContractDialog } from "./FreightContractDialog";
import { unmaskCNPJ, maskCNPJ } from "@/lib/masks";
import {
  CteDescontoFields,
  type DescontoState,
  emptyDesconto,
  calcDescontoTotal,
  serializeDesconto,
  deserializeDesconto,
} from "./CteDescontoFields";
import type { Cte } from "@/pages/FreightCte";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte | null;
  onSaved: () => void;
}

interface FormState {
  // Tomador / cliente (mantido para previsão de recebimento)
  tomador_id: string | null;
  // Atores fiscais
  remetente_nome: string; remetente_cnpj: string; remetente_ie: string; remetente_endereco: string; remetente_municipio_ibge: string; remetente_uf: string;
  destinatario_nome: string; destinatario_cnpj: string; destinatario_ie: string; destinatario_endereco: string; destinatario_municipio_ibge: string; destinatario_uf: string;
  expedidor_nome: string; expedidor_cnpj: string; expedidor_ie: string; expedidor_endereco: string; expedidor_municipio_ibge: string; expedidor_uf: string;
  recebedor_nome: string; recebedor_cnpj: string; recebedor_ie: string; recebedor_endereco: string; recebedor_municipio_ibge: string; recebedor_uf: string;
  // Carga
  natureza_carga: string;
  // Carregamento
  data_carregamento: string;
  // Motorista / veículo
  motorista_id: string | null;
  motorista_nome: string;
  placa_veiculo: string;
  // Valores
  peso_bruto_kg: string;
  valor_tonelada: string;
  observacoes: string;
}

const empty: FormState = {
  tomador_id: null,
  remetente_nome: "", remetente_cnpj: "", remetente_ie: "", remetente_endereco: "", remetente_municipio_ibge: "", remetente_uf: "",
  destinatario_nome: "", destinatario_cnpj: "", destinatario_ie: "", destinatario_endereco: "", destinatario_municipio_ibge: "", destinatario_uf: "",
  expedidor_nome: "", expedidor_cnpj: "", expedidor_ie: "", expedidor_endereco: "", expedidor_municipio_ibge: "", expedidor_uf: "",
  recebedor_nome: "", recebedor_cnpj: "", recebedor_ie: "", recebedor_endereco: "", recebedor_municipio_ibge: "", recebedor_uf: "",
  natureza_carga: "",
  data_carregamento: new Date().toISOString().slice(0, 10),
  motorista_id: null,
  motorista_nome: "",
  placa_veiculo: "",
  peso_bruto_kg: "",
  valor_tonelada: "",
  observacoes: "",
};

export function CteServicoFormDialog({ open, onOpenChange, cte, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { matrizId } = useUnifiedCompany();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [gerarContrato, setGerarContrato] = useState(false);
  const [savedCteForContract, setSavedCteForContract] = useState<Cte | null>(null);
  const [desconto, setDesconto] = useState<DescontoState>(emptyDesconto);

  useEffect(() => {
    if (!open) return;
    if (cte) {
      const c = cte as any;
      setForm({
        tomador_id: cte.tomador_id ?? null,
        remetente_nome: cte.remetente_nome ? maskName(cte.remetente_nome) : "",
        remetente_cnpj: cte.remetente_cnpj ? maskCNPJ(cte.remetente_cnpj) : "",
        remetente_ie: cte.remetente_ie || "",
        remetente_endereco: cte.remetente_endereco || "",
        remetente_municipio_ibge: cte.remetente_municipio_ibge || "",
        remetente_uf: cte.remetente_uf || "",
        destinatario_nome: cte.destinatario_nome ? maskName(cte.destinatario_nome) : "",
        destinatario_cnpj: cte.destinatario_cnpj ? maskCNPJ(cte.destinatario_cnpj) : "",
        destinatario_ie: cte.destinatario_ie || "",
        destinatario_endereco: cte.destinatario_endereco || "",
        destinatario_municipio_ibge: cte.destinatario_municipio_ibge || "",
        destinatario_uf: cte.destinatario_uf || "",
        expedidor_nome: c.expedidor_nome ? maskName(c.expedidor_nome) : "",
        expedidor_cnpj: c.expedidor_cnpj ? maskCNPJ(c.expedidor_cnpj) : "",
        expedidor_ie: c.expedidor_ie || "",
        expedidor_endereco: c.expedidor_endereco || "",
        expedidor_municipio_ibge: c.expedidor_municipio_ibge || "",
        expedidor_uf: c.expedidor_uf || "",
        recebedor_nome: c.recebedor_nome ? maskName(c.recebedor_nome) : "",
        recebedor_cnpj: c.recebedor_cnpj ? maskCNPJ(c.recebedor_cnpj) : "",
        recebedor_ie: c.recebedor_ie || "",
        recebedor_endereco: c.recebedor_endereco || "",
        recebedor_municipio_ibge: c.recebedor_municipio_ibge || "",
        recebedor_uf: c.recebedor_uf || "",
        natureza_carga: cte.produto_predominante || cte.natureza_operacao || "",
        data_carregamento:
          c.data_carregamento ||
          (cte.data_emissao ? cte.data_emissao.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        motorista_id: cte.motorista_id ?? null,
        motorista_nome: c.motorista_nome || "",
        placa_veiculo: cte.placa_veiculo || "",
        peso_bruto_kg: cte.peso_bruto ? String(cte.peso_bruto) : "",
        valor_tonelada: c.valor_tonelada
          ? maskCurrency(String(Number(c.valor_tonelada).toFixed(2)).replace(".", ""))
          : "",
        observacoes: cte.observacoes || "",
      });
      setDesconto(deserializeDesconto((cte as any).desconto));
    } else {
      setForm(empty);
      setDesconto(emptyDesconto);
    }
  }, [open, cte]);

  const pesoTon = (Number(form.peso_bruto_kg) || 0) / 1000;
  const valorTon = Number(unmaskCurrency(form.valor_tonelada)) || 0;
  const valorBruto = +(pesoTon * valorTon).toFixed(2);
  const valorDesconto = calcDescontoTotal(desconto);
  const valorFrete = +Math.max(0, valorBruto - valorDesconto).toFixed(2);

  const handleSave = async () => {
    if (!form.remetente_nome || !form.destinatario_nome) {
      toast({ title: "Cliente obrigatório", description: "Selecione o tomador/cliente.", variant: "destructive" });
      return;
    }
    if (!form.natureza_carga) {
      toast({ title: "Natureza obrigatória", description: "Informe a natureza da carga.", variant: "destructive" });
      return;
    }
    if (!form.data_carregamento) {
      toast({ title: "Data obrigatória", description: "Informe a data do carregamento.", variant: "destructive" });
      return;
    }
    if (valorFrete <= 0) {
      toast({ title: "Valor inválido", description: "Informe peso e valor por tonelada.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const establishmentId = matrizId || cte?.establishment_id || null;

      // Get next internal number for new records
      let numero_interno = (cte as any)?.numero_interno ?? null;
      if (!cte && establishmentId) {
        const { data: nextNum, error: numErr } = await supabase.rpc("next_cte_servico_number", {
          _establishment_id: establishmentId,
        });
        if (numErr) throw numErr;
        numero_interno = nextNum as number;
      }

      const payload: Record<string, any> = {
        tipo_talao: "servico",
        status: "rascunho", // talão de serviço fica sempre como "rascunho" (interno)
        establishment_id: establishmentId,
        numero_interno,
        // Reaproveitamos campos existentes para refletir os dados informados
        tomador_id: form.tomador_id,
        destinatario_nome: maskName(form.tomador_nome),
        destinatario_cnpj: form.tomador_cnpj || null,
        remetente_nome: maskName(form.tomador_nome), // exigido por NOT NULL
        natureza_operacao: form.natureza_carga,
        produto_predominante: form.natureza_carga,
        data_carregamento: form.data_carregamento,
        data_emissao: new Date().toISOString(),
        motorista_id: form.motorista_id,
        motorista_nome: form.motorista_nome ? maskName(form.motorista_nome) : null,
        placa_veiculo: form.placa_veiculo ? unmaskPlate(form.placa_veiculo).toUpperCase() : null,
        peso_bruto: Number(form.peso_bruto_kg) || 0,
        valor_tonelada: valorTon,
        valor_frete: valorFrete,
        valor_carga: valorFrete,
        // Defaults to satisfy schema
        cfop: "0000",
        modal: "01",
        tp_cte: 0,
        tp_serv: 0,
        tomador_tipo: 3,
        base_calculo_icms: 0,
        aliquota_icms: 0,
        valor_icms: 0,
        cst_icms: "00",
        observacoes: form.observacoes || null,
        desconto: serializeDesconto(desconto),
        created_by: user?.id ?? null,
      };

      let savedId: string;
      if (cte) {
        const { error } = await supabase.from("ctes").update(payload).eq("id", cte.id);
        if (error) throw error;
        savedId = cte.id;
      } else {
        const { data, error } = await supabase.from("ctes").insert(payload as any).select("id").single();
        if (error) throw error;
        savedId = data.id;
      }

      // Gerar/atualizar previsão de recebimento (interno)
      if (form.tomador_id) {
        await supabase.from("previsoes_recebimento").upsert(
          {
            origem_tipo: "cte" as any,
            origem_id: savedId,
            cliente_id: form.tomador_id,
            valor: valorFrete,
            data_prevista: form.data_carregamento,
            status: "pendente" as any,
          },
          { onConflict: "origem_tipo,origem_id" }
        );
      }

      toast({ title: cte ? "Talão atualizado" : "Talão de Serviço criado" });
      onSaved();

      if (gerarContrato) {
        // Recupera o CT-e salvo para alimentar o FreightContractDialog
        const { data: fresh } = await supabase.from("ctes").select("*").eq("id", savedId).single();
        setSavedCteForContract(fresh as any);
      } else {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {cte ? "Editar Talão de Serviço" : "Novo Talão de Serviço"}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Registro interno — não é enviado à SEFAZ.
          </p>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Tomador / Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" /> Tomador / Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PersonSearchInput
                categories={["cliente"]}
                placeholder="Buscar cliente..."
                selectedName={form.tomador_nome}
                onSelect={(p) =>
                  setForm((f) => ({
                    ...f,
                    tomador_id: p.id,
                    tomador_nome: p.razao_social || p.full_name,
                    tomador_cnpj: p.cnpj || "",
                  }))
                }
                onClear={() =>
                  setForm((f) => ({ ...f, tomador_id: null, tomador_nome: "", tomador_cnpj: "" }))
                }
              />
            </CardContent>
          </Card>

          {/* Carga */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Carga
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Natureza da carga *</Label>
                <CargaSearchInput
                  placeholder="Buscar natureza no cadastro de cargas..."
                  selectedName={form.natureza_carga || undefined}
                  onSelect={(carga) => {
                    setForm((f) => ({
                      ...f,
                      natureza_carga: carga.produto_predominante,
                      peso_bruto_kg: carga.peso_bruto && !f.peso_bruto_kg ? String(carga.peso_bruto) : f.peso_bruto_kg,
                    }));
                  }}
                  onClear={() => setForm((f) => ({ ...f, natureza_carga: "" }))}
                />
              </div>
              <div>
                <Label className="text-xs">Data do carregamento *</Label>
                <Input
                  type="date"
                  value={form.data_carregamento}
                  onChange={(e) => setForm((f) => ({ ...f, data_carregamento: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Motorista / veículo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4" /> Motorista e Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PersonSearchInput
                categories={["motorista"]}
                placeholder="Buscar motorista..."
                selectedName={form.motorista_nome}
                onSelect={async (p) => {
                  setForm((f) => ({
                    ...f,
                    motorista_id: p.id,
                    motorista_nome: p.full_name,
                  }));
                  // Auto-preenche placa do veículo ativo vinculado ao motorista
                  try {
                    const { data: vehicles } = await supabase
                      .from("vehicles")
                      .select("plate")
                      .eq("driver_id", p.user_id)
                      .eq("is_active", true)
                      .limit(1);
                    if (vehicles && vehicles.length > 0 && vehicles[0].plate) {
                      setForm((f) => ({ ...f, placa_veiculo: maskPlate(vehicles[0].plate) }));
                    }
                  } catch {}
                }}
                onClear={() =>
                  setForm((f) => ({ ...f, motorista_id: null, motorista_nome: "", placa_veiculo: "" }))
                }
              />
              <div>
                <Label className="text-xs">Placa</Label>
                <Input
                  value={form.placa_veiculo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, placa_veiculo: maskPlate(e.target.value) }))
                  }
                  placeholder="ABC1D23"
                  maxLength={8}
                />
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Peso e Valor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Peso (kg) *</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.peso_bruto_kg}
                    onChange={(e) => setForm((f) => ({ ...f, peso_bruto_kg: e.target.value }))}
                    placeholder="Ex.: 30000"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Valor por tonelada *</Label>
                  <Input
                    value={form.valor_tonelada}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, valor_tonelada: maskCurrency(e.target.value) }))
                    }
                    placeholder="R$ 0,00"
                  />
                </div>
              </div>
              <div className="bg-muted/30 rounded-md px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Valor bruto</span>
                <span className="font-mono text-sm font-semibold">
                  {valorBruto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>

              <CteDescontoFields value={desconto} onChange={setDesconto} />

              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Valor total do frete</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {valorFrete.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </CardContent>
          </Card>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              rows={3}
            />
          </div>

          <label className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/5 cursor-pointer">
            <Checkbox
              checked={gerarContrato}
              onCheckedChange={(v) => setGerarContrato(!!v)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <span className="flex items-center gap-1 font-semibold">
                <FileSignature className="w-3.5 h-3.5" /> Gerar contrato de frete
              </span>
              <span className="block text-muted-foreground">
                Após salvar, abre o formulário do contrato de fretamento (subcontratado) e gera conta a pagar à vista.
              </span>
            </span>
          </label>

          <div className="flex gap-2 sticky bottom-0 bg-background pt-3 pb-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {cte ? "Salvar alterações" : "Criar Talão"}
            </Button>
          </div>
        </div>
      </SheetContent>

      <FreightContractDialog
        open={!!savedCteForContract}
        onOpenChange={(o) => {
          if (!o) {
            setSavedCteForContract(null);
            setGerarContrato(false);
            onOpenChange(false);
          }
        }}
        cte={savedCteForContract}
        onSaved={onSaved}
      />
    </Sheet>
  );
}
