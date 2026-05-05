import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, FileSignature, Printer, Building2, Truck, User, Coins } from "lucide-react";
import { maskCurrency, unmaskCurrency, maskName, formatCurrency } from "@/lib/masks";
import { PersonSearchInput } from "./PersonSearchInput";
import { CteDescontoFields, emptyDesconto, calcDescontoTotal, type DescontoState } from "./CteDescontoFields";
import type { Cte } from "@/pages/FreightCte";
import { buildFullContractHtml, openPrintWindow } from "./freightContractPrint";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte | null;
  onSaved?: () => void;
}

interface ContractForm {
  contratado_id: string | null;
  contratado_nome: string;
  contratado_documento: string;
  contratado_tipo: "PF" | "PJ";
  motorista_id: string | null;
  motorista_nome: string;
  motorista_cpf: string;
  vehicle_id: string | null;
  placa_veiculo: string;
  veiculo_modelo: string;
  municipio_origem: string;
  uf_origem: string;
  municipio_destino: string;
  uf_destino: string;
  natureza_carga: string;
  peso_kg: string;
  valor_tonelada: string;
  observacoes: string;
}

const empty: ContractForm = {
  contratado_id: null,
  contratado_nome: "",
  contratado_documento: "",
  contratado_tipo: "PF",
  motorista_id: null,
  motorista_nome: "",
  motorista_cpf: "",
  vehicle_id: null,
  placa_veiculo: "",
  veiculo_modelo: "",
  municipio_origem: "",
  uf_origem: "",
  municipio_destino: "",
  uf_destino: "",
  natureza_carga: "",
  peso_kg: "",
  valor_tonelada: "",
  observacoes: "",
};

// Tenta extrair "Cidade" de strings tipo "Rua X, 123 - Bairro - Cidade/UF" ou "...; Cidade - UF"
function extractCityFromAddress(addr?: string | null): string {
  if (!addr) return "";
  // Procura padrão "Cidade/UF" ou "Cidade - UF"
  const m = addr.match(/([A-Za-zÀ-ÿ\s.'-]+?)\s*[\/\-]\s*([A-Z]{2})\b/);
  if (m) return m[1].trim();
  return "";
}

function resolveContractLocation(city?: string | null, address?: string | null, _actorName?: string | null): string {
  // Não usa o nome do ator como fallback — evita preencher município com razão social.
  return (city || extractCityFromAddress(address) || "").trim();
}

export function FreightContractDialog({ open, onOpenChange, cte, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<ContractForm>(empty);
  const [desconto, setDesconto] = useState<DescontoState>(emptyDesconto);
  const [saving, setSaving] = useState(false);
  const [savedContract, setSavedContract] = useState<{ id: string; numero: number } | null>(null);

  // Pré-preenche a partir do CT-e (e busca veículo/proprietário)
  useEffect(() => {
    if (!open || !cte) return;
    setSavedContract(null);
    setDesconto(emptyDesconto);

    const init = async () => {
      const { data: freshCte } = await supabase.from("ctes").select("*").eq("id", cte.id).maybeSingle();
      const linkedCte = { ...cte, ...((freshCte as any) || {}) } as Cte;
      const cAny = linkedCte as any;
      const placa = (linkedCte.placa_veiculo || "").toUpperCase();
      let vehicle: any = null;
      let owner: any = null;
      let driver: any = null;

      if (placa) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("id, plate, brand, model, owner_id, driver_id")
          .eq("plate", placa)
          .maybeSingle();
        vehicle = v;
        if (vehicle?.owner_id) {
          // vehicles.owner_id referencia auth.users.id → buscar profile via user_id
          const { data: p } = await supabase
            .from("profiles")
            .select("id, user_id, full_name, razao_social, cnpj, person_type, category, is_owner")
            .eq("user_id", vehicle.owner_id)
            .maybeSingle();
          owner = p;
        }
      }

      // Buscar dados do motorista (profile + documentos: CPF)
      // Fallback: se cte.motorista_id estiver vazio, tenta pelo driver_id do veículo
      let driverCpf = "";
      let motoristaProfileId: string | null = linkedCte.motorista_id || null;
      if (!motoristaProfileId && vehicle?.driver_id) {
        const { data: dp } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", vehicle.driver_id)
          .maybeSingle();
        motoristaProfileId = dp?.id || null;
      }
      if (motoristaProfileId) {
        const { data: d } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, cnpj")
          .eq("id", motoristaProfileId)
          .maybeSingle();
        driver = d;

        if (d?.user_id) {
          const { data: ddoc } = await supabase
            .from("driver_documents")
            .select("cpf")
            .eq("user_id", d.user_id)
            .maybeSingle();
          driverCpf = (ddoc as any)?.cpf || "";
        }
        // Fallback: usar campo cnpj do profile como documento (CPF/CNPJ)
        if (!driverCpf && (d as any)?.cnpj) {
          driverCpf = (d as any).cnpj;
        }
      }

      // Se não há owner via veículo, mas o motorista é proprietário (is_owner), usa-o
      if (!owner && linkedCte.motorista_id) {
        const { data: dOwner } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, razao_social, cnpj, person_type, is_owner")
          .eq("id", linkedCte.motorista_id)
          .maybeSingle();
        if (dOwner?.is_owner) owner = dOwner;
      }

      // Buscar CPF do proprietário (driver_documents.user_id = profiles.user_id)
      let ownerCpf = "";
      if (owner?.user_id) {
        const { data: ownerDoc } = await supabase
          .from("driver_documents")
          .select("cpf")
          .eq("user_id", owner.user_id)
          .maybeSingle();
        ownerCpf = (ownerDoc as any)?.cpf || "";
      }

      const ownerCnpj = owner?.cnpj || "";
      const ptype = (owner?.person_type || "").toString().toLowerCase();
      const isPJ = ptype
        ? (ptype === "pj" || ptype === "cnpj" || ptype === "juridica")
        : !!ownerCnpj && ownerCnpj.replace(/\D/g, "").length === 14;

      // Helper: busca cidade/UF no cadastro de profiles pelo nome do ator
      const lookupActorCity = async (name?: string | null): Promise<{ city: string; uf: string }> => {
        if (!name?.trim()) return { city: "", uf: "" };
        const { data } = await supabase
          .from("profiles")
          .select("address_city, address_state")
          .or(`full_name.ilike.${name.trim()},razao_social.ilike.${name.trim()}`)
          .limit(1)
          .maybeSingle();
          return { city: (data as any)?.address_city || "", uf: (data as any)?.address_state || "" };
      };

      // Origem: trecho oficial do CT-e → endereço/cadastro do expedidor → remetente
      let origemMunicipio =
        resolveContractLocation(linkedCte.municipio_origem_nome, null, null) ||
        resolveContractLocation(cAny.expedidor_municipio_nome, cAny.expedidor_endereco, null) ||
        resolveContractLocation(cAny.remetente_municipio_nome, linkedCte.remetente_endereco, null);
      let origemUf = linkedCte.uf_origem || cAny.expedidor_uf || linkedCte.remetente_uf || "";
      if (!origemMunicipio) {
        const fromExp = await lookupActorCity(cAny.expedidor_nome);
        const fromRem = fromExp.city ? fromExp : await lookupActorCity(linkedCte.remetente_nome);
        origemMunicipio = fromRem.city;
        if (!origemUf) origemUf = fromRem.uf;
      }

      // Destino: trecho oficial do CT-e → endereço/cadastro do recebedor → destinatário
      let destinoMunicipio =
        resolveContractLocation(linkedCte.municipio_destino_nome, null, null) ||
        resolveContractLocation(cAny.recebedor_municipio_nome, cAny.recebedor_endereco, null) ||
        resolveContractLocation(cAny.destinatario_municipio_nome, linkedCte.destinatario_endereco, null);
      let destinoUf = linkedCte.uf_destino || cAny.recebedor_uf || linkedCte.destinatario_uf || "";
      if (!destinoMunicipio) {
        const fromRec = await lookupActorCity(cAny.recebedor_nome);
        const fromDest = fromRec.city ? fromRec : await lookupActorCity(linkedCte.destinatario_nome);
        destinoMunicipio = fromDest.city;
        if (!destinoUf) destinoUf = fromDest.uf;
      }

      setForm({
        contratado_id: owner?.id ?? null,
        contratado_nome: owner ? owner.razao_social || owner.full_name || "" : "",
        contratado_documento: isPJ ? ownerCnpj : (ownerCpf || ownerCnpj),
        contratado_tipo: isPJ ? "PJ" : "PF",
        motorista_id: driver?.id ?? motoristaProfileId,
        motorista_nome: driver?.full_name || cAny.motorista_nome || "",
        motorista_cpf: driverCpf || cAny.motorista_cpf || "",
        vehicle_id: vehicle?.id ?? null,
        placa_veiculo: placa,
        veiculo_modelo: vehicle ? `${vehicle.brand || ""} ${vehicle.model || ""}`.trim() : "",
        municipio_origem: origemMunicipio,
        uf_origem: origemUf,
        municipio_destino: destinoMunicipio,
        uf_destino: destinoUf,
        natureza_carga: cAny.produto_predominante || linkedCte.natureza_operacao || "",
        peso_kg: linkedCte.peso_bruto ? String(linkedCte.peso_bruto) : "",
        // Valor por tonelada deixado em branco propositalmente para o usuário
        // negociar o frete terceiro sem herdar o valor do CT-e.
        valor_tonelada: "",
        observacoes: "",
      });
    };
    init();
  }, [open, cte]);

  const pesoTon = (Number(form.peso_kg) || 0) / 1000;
  const valorTon = Number(unmaskCurrency(form.valor_tonelada)) || 0;
  const valorBruto = useMemo(() => +(pesoTon * valorTon).toFixed(2), [pesoTon, valorTon]);
  const descontoTotal = useMemo(() => calcDescontoTotal(desconto), [desconto]);
  const valorTotal = useMemo(() => +Math.max(0, valorBruto - descontoTotal).toFixed(2), [valorBruto, descontoTotal]);

  const handleSave = async () => {
    if (!cte) return;
    if (!form.contratado_id) {
      toast({
        title: "Contratado obrigatório",
        description: "Selecione o proprietário do veículo (ou marque o motorista como proprietário no cadastro).",
        variant: "destructive",
      });
      return;
    }
    if (valorTotal <= 0) {
      toast({ title: "Valor inválido", description: "Informe peso e valor por tonelada.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_freight_contract_with_payable", {
        _cte_id: cte.id,
        _establishment_id: cte.establishment_id || null,
        _contratado_id: form.contratado_id,
        _contratado_nome: maskName(form.contratado_nome),
        _contratado_documento: form.contratado_documento || null,
        _contratado_tipo: form.contratado_tipo,
        _motorista_id: form.motorista_id,
        _motorista_nome: form.motorista_nome ? maskName(form.motorista_nome) : null,
        _motorista_cpf: form.motorista_cpf || null,
        _vehicle_id: form.vehicle_id,
        _placa_veiculo: form.placa_veiculo || null,
        _veiculo_modelo: form.veiculo_modelo || null,
        _municipio_origem: form.municipio_origem || null,
        _uf_origem: form.uf_origem || null,
        _municipio_destino: form.municipio_destino || null,
        _uf_destino: form.uf_destino || null,
        _natureza_carga: form.natureza_carga || null,
        _peso_kg: Number(form.peso_kg) || 0,
        _valor_tonelada: valorTon,
        _valor_total: valorTotal,
        _observacoes: buildObservacoesComDesconto(form.observacoes, desconto, descontoTotal, valorBruto) || null,
        _user_id: user?.id ?? null,
      });
      if (error) throw error;

      // buscar número
      const { data: created } = await supabase
        .from("freight_contracts")
        .select("id, numero")
        .eq("id", data as string)
        .single();

      setSavedContract({ id: created!.id, numero: created!.numero });
      toast({ title: "Contrato gerado", description: `Contrato Nº ${created!.numero} criado e conta a pagar lançada.` });
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Erro ao gerar contrato", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!savedContract || !cte) return;
    const html = await buildFullContractHtml({
      numero: savedContract.numero,
      data_contrato: new Date().toISOString().slice(0, 10),
      contratado_id: form.contratado_id,
      contratado_nome: form.contratado_nome,
      contratado_documento: form.contratado_documento,
      contratado_tipo: form.contratado_tipo,
      motorista_id: form.motorista_id,
      motorista_nome: form.motorista_nome,
      motorista_cpf: form.motorista_cpf,
      vehicle_id: form.vehicle_id,
      placa_veiculo: form.placa_veiculo,
      veiculo_modelo: form.veiculo_modelo,
      municipio_origem: form.municipio_origem,
      uf_origem: form.uf_origem,
      municipio_destino: form.municipio_destino,
      uf_destino: form.uf_destino,
      natureza_carga: form.natureza_carga,
      peso_kg: Number(form.peso_kg) || 0,
      valor_tonelada: valorTon,
      valor_total: valorTotal,
      observacoes: buildObservacoesComDesconto(form.observacoes, desconto, descontoTotal, valorBruto),
      cte: { numero: (cte as any).numero, serie: (cte as any).serie, tipo_talao: (cte as any).tipo_talao },
    });
    openPrintWindow(html);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileSignature className="w-5 h-5" /> Contrato de Frete
          </DialogTitle>
          <DialogDescription>
            Contrato de fretamento entre SIME (contratante) e o contratado (subcontratado).
            Será gerada conta a pagar à vista no plano "Frete Terceiros".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contratado */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="w-4 h-4" /> Contratado (Proprietário)
              </div>
              <PersonSearchInput
                categories={["proprietario", "motorista"]}
                placeholder="Buscar proprietário..."
                selectedName={form.contratado_nome}
                onSelect={async (p) => {
                  // Busca dados completos do profile (documento e tipo)
                  const { data: full } = await supabase
                    .from("profiles")
                    .select("id, user_id, full_name, razao_social, cnpj, person_type")
                    .eq("id", p.id)
                    .maybeSingle();
                  let cpfDoc = "";
                  if (full?.user_id) {
                    const { data: doc } = await supabase
                      .from("driver_documents")
                      .select("cpf")
                      .eq("user_id", full.user_id)
                      .maybeSingle();
                    cpfDoc = (doc as any)?.cpf || "";
                  }
                  const cnpj = full?.cnpj || p.cnpj || "";
                  const ptype = (full?.person_type || "").toString().toLowerCase();
                  const isPJ = ptype
                    ? (ptype === "pj" || ptype === "cnpj" || ptype === "juridica")
                    : !!cnpj && cnpj.replace(/\D/g, "").length === 14;
                  setForm((f) => ({
                    ...f,
                    contratado_id: p.id,
                    contratado_nome: full?.razao_social || full?.full_name || p.razao_social || p.full_name,
                    contratado_documento: isPJ ? cnpj : (cpfDoc || cnpj),
                    contratado_tipo: isPJ ? "PJ" : "PF",
                  }));
                }}
                onClear={() =>
                  setForm((f) => ({
                    ...f,
                    contratado_id: null,
                    contratado_nome: "",
                    contratado_documento: "",
                    contratado_tipo: "PF",
                  }))
                }
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Documento (CPF/CNPJ)</Label>
                  <Input
                    value={form.contratado_documento}
                    readOnly
                    disabled
                    placeholder="Preenchido automaticamente"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Input
                    value={form.contratado_tipo}
                    readOnly
                    disabled
                    className="font-semibold text-center"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Motorista e Veículo */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="w-4 h-4" /> Motorista e Veículo
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Motorista</Label>
                  <Input
                    value={form.motorista_nome}
                    onChange={(e) => setForm((f) => ({ ...f, motorista_nome: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">CPF do motorista</Label>
                  <Input
                    value={form.motorista_cpf}
                    onChange={(e) => setForm((f) => ({ ...f, motorista_cpf: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Placa</Label>
                  <Input
                    value={form.placa_veiculo}
                    onChange={(e) => setForm((f) => ({ ...f, placa_veiculo: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Modelo</Label>
                  <Input
                    value={form.veiculo_modelo}
                    onChange={(e) => setForm((f) => ({ ...f, veiculo_modelo: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Origem/Destino e Carga */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <User className="w-4 h-4" /> Trecho e Carga
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3">
                    <Label className="text-xs">Município de origem</Label>
                    <Input
                      value={form.municipio_origem}
                      onChange={(e) => setForm((f) => ({ ...f, municipio_origem: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">UF</Label>
                    <Input
                      value={form.uf_origem}
                      onChange={(e) => setForm((f) => ({ ...f, uf_origem: e.target.value.toUpperCase() }))}
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3">
                    <Label className="text-xs">Município de destino</Label>
                    <Input
                      value={form.municipio_destino}
                      onChange={(e) => setForm((f) => ({ ...f, municipio_destino: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">UF</Label>
                    <Input
                      value={form.uf_destino}
                      onChange={(e) => setForm((f) => ({ ...f, uf_destino: e.target.value.toUpperCase() }))}
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Natureza da carga</Label>
                <Input
                  value={form.natureza_carga}
                  onChange={(e) => setForm((f) => ({ ...f, natureza_carga: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Coins className="w-4 h-4" /> Valores do Contrato
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Peso (kg) *</Label>
                  <Input
                    type="number"
                    value={form.peso_kg}
                    onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Valor por tonelada *</Label>
                  <Input
                    value={form.valor_tonelada}
                    onChange={(e) => setForm((f) => ({ ...f, valor_tonelada: maskCurrency(e.target.value) }))}
                    placeholder="R$ 0,00"
                  />
                </div>
              </div>
              <div className="bg-muted/30 rounded-md px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Valor bruto do frete</span>
                <span className="font-semibold text-sm">{formatCurrency(valorBruto)}</span>
              </div>

              <CteDescontoFields value={desconto} onChange={setDesconto} />

              <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Valor total a pagar (frete terceiro)</span>
                <span className="font-semibold text-base text-primary">{formatCurrency(valorTotal)}</span>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea
                  rows={2}
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 sticky bottom-0 bg-background pt-3 pb-2">
            {!savedContract ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Gerar Contrato e Conta a Pagar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button className="flex-1 gap-2" onClick={handlePrint}>
                  <Printer className="w-4 h-4" />
                  Imprimir Contrato Nº {savedContract.numero}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Helpers -----------------
function buildObservacoesComDesconto(
  base: string,
  desconto: DescontoState,
  total: number,
  valorBruto: number,
): string {
  if (desconto.tipo === "nenhum" || total <= 0) return base || "";
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let linha = "";
  if (desconto.tipo === "diesel") {
    const litros = parseFloat((desconto.litros || "0").replace(",", ".")) || 0;
    const vl = Number(unmaskCurrency(desconto.valorLitro)) || 0;
    linha = `Desconto Diesel: ${litros.toLocaleString("pt-BR")} L × ${fmt(vl)} = ${fmt(total)}`;
  } else {
    linha = `Desconto (${desconto.descricao || "outros"}): ${fmt(total)}`;
  }
  const resumo = `Bruto ${fmt(valorBruto)} − ${linha} → Líquido ${fmt(valorBruto - total)}`;
  return [base, linha, resumo].filter(Boolean).join("\n");
}

