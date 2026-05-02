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
import type { Cte } from "@/pages/FreightCte";

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

export function FreightContractDialog({ open, onOpenChange, cte, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<ContractForm>(empty);
  const [saving, setSaving] = useState(false);
  const [savedContract, setSavedContract] = useState<{ id: string; numero: number } | null>(null);

  // Pré-preenche a partir do CT-e (e busca veículo/proprietário)
  useEffect(() => {
    if (!open || !cte) return;
    setSavedContract(null);

    const init = async () => {
      const placa = (cte.placa_veiculo || "").toUpperCase();
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
          const { data: p } = await supabase
            .from("profiles")
            .select("id, full_name, razao_social, cpf, cnpj, category")
            .eq("id", vehicle.owner_id)
            .maybeSingle();
          owner = p;
        }
      }

      if (cte.motorista_id) {
        const { data: d } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", cte.motorista_id)
          .maybeSingle();
        driver = d;
      }

      // Se não há owner via veículo, mas o motorista é proprietário (is_owner), usa-o
      if (!owner && cte.motorista_id) {
        const { data: dOwner } = await supabase
          .from("profiles")
          .select("id, full_name, razao_social, cnpj, is_owner")
          .eq("id", cte.motorista_id)
          .maybeSingle();
        if (dOwner?.is_owner) owner = dOwner;
      }

      const isPJ = !!owner?.cnpj;
      setForm({
        contratado_id: owner?.id ?? null,
        contratado_nome: owner ? owner.razao_social || owner.full_name || "" : "",
        contratado_documento: owner?.cnpj || "",
        contratado_tipo: isPJ ? "PJ" : "PF",
        motorista_id: driver?.id ?? cte.motorista_id ?? null,
        motorista_nome: driver?.full_name || (cte as any).motorista_nome || "",
        motorista_cpf: (cte as any).motorista_cpf || "",
        vehicle_id: vehicle?.id ?? null,
        placa_veiculo: placa,
        veiculo_modelo: vehicle ? `${vehicle.brand || ""} ${vehicle.model || ""}`.trim() : "",
        municipio_origem: cte.municipio_origem_nome || "",
        uf_origem: cte.uf_origem || "",
        municipio_destino: cte.municipio_destino_nome || "",
        uf_destino: cte.uf_destino || "",
        natureza_carga: (cte as any).produto_predominante || cte.natureza_operacao || "",
        peso_kg: cte.peso_bruto ? String(cte.peso_bruto) : "",
        valor_tonelada: (cte as any).valor_tonelada
          ? maskCurrency(Number((cte as any).valor_tonelada).toFixed(2).replace(".", ""))
          : "",
        observacoes: "",
      });
    };
    init();
  }, [open, cte]);

  const pesoTon = (Number(form.peso_kg) || 0) / 1000;
  const valorTon = Number(unmaskCurrency(form.valor_tonelada)) || 0;
  const valorTotal = useMemo(() => +(pesoTon * valorTon).toFixed(2), [pesoTon, valorTon]);

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
        _observacoes: form.observacoes || null,
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

  const handlePrint = () => {
    if (!savedContract) return;
    const html = buildContractHtml({
      numero: savedContract.numero,
      cte,
      form,
      pesoTon,
      valorTon,
      valorTotal,
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.onload = () => {
        setTimeout(() => w.print(), 400);
      };
    }
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
                  // Busca dados completos do profile (cpf, cnpj, person_type)
                  const { data: full } = await supabase
                    .from("profiles")
                    .select("id, full_name, razao_social, cpf, cnpj, person_type")
                    .eq("id", p.id)
                    .maybeSingle();
                  const cnpj = full?.cnpj || p.cnpj || "";
                  const cpf = (full as any)?.cpf || "";
                  const isPJ = !!cnpj || (full as any)?.person_type === "PJ";
                  setForm((f) => ({
                    ...f,
                    contratado_id: p.id,
                    contratado_nome: full?.razao_social || full?.full_name || p.razao_social || p.full_name,
                    contratado_documento: isPJ ? cnpj : cpf,
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
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <Label className="text-xs">Origem</Label>
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
                <div className="col-span-3">
                  <Label className="text-xs">Destino</Label>
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
                <div className="col-span-4">
                  <Label className="text-xs">Natureza da carga</Label>
                  <Input
                    value={form.natureza_carga}
                    onChange={(e) => setForm((f) => ({ ...f, natureza_carga: e.target.value }))}
                  />
                </div>
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
                <span className="text-xs text-muted-foreground">Valor total a pagar (frete terceiro)</span>
                <span className="font-semibold text-base">{formatCurrency(valorTotal)}</span>
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

// ----------------- Print HTML -----------------
function buildContractHtml(args: {
  numero: number;
  cte: Cte | null;
  form: ContractForm;
  pesoTon: number;
  valorTon: number;
  valorTotal: number;
}) {
  const { numero, form, pesoTon, valorTon, valorTotal } = args;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataExt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato de Frete Nº ${numero}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.45; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 10pt; color: #555; margin-bottom: 18px; }
  table.parties { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10pt; }
  table.parties th, table.parties td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
  table.parties th { background: #f1f1f1; width: 28%; }
  h2 { font-size: 11pt; margin: 14px 0 6px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 2px; }
  p { margin: 4px 0; text-align: justify; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 10pt; }
  .grid div b { display: inline-block; min-width: 140px; }
  .sign { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sign .line { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 10pt; }
  .total-box { margin-top: 8px; padding: 8px 12px; background: #f5f5f5; border-left: 4px solid #2B4C7E; font-size: 11pt; }
</style></head><body>
<h1>Contrato de Prestação de Serviço de Frete</h1>
<div class="sub">Contrato Nº ${String(numero).padStart(6, "0")} — ${dataExt}</div>

<table class="parties">
  <tr><th>CONTRATANTE</th><td><b>SIME TRANSPORTE LTDA</b></td></tr>
  <tr><th>CONTRATADO</th><td>
    <b>${form.contratado_nome || "-"}</b><br/>
    ${form.contratado_tipo === "PJ" ? "CNPJ" : "CPF"}: ${form.contratado_documento || "-"} — Tipo: ${form.contratado_tipo}
  </td></tr>
</table>

<h2>1. Objeto</h2>
<p>O presente instrumento tem por objeto a contratação, pela CONTRATANTE, do serviço de transporte rodoviário de cargas a ser executado pelo CONTRATADO, observadas as condições, valores e responsabilidades estabelecidas neste contrato.</p>

<h2>2. Trecho e Carga</h2>
<div class="grid">
  <div><b>Origem:</b> ${form.municipio_origem || "-"}/${form.uf_origem || "--"}</div>
  <div><b>Destino:</b> ${form.municipio_destino || "-"}/${form.uf_destino || "--"}</div>
  <div><b>Natureza:</b> ${form.natureza_carga || "-"}</div>
  <div><b>Peso:</b> ${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t (${Number(form.peso_kg || 0).toLocaleString("pt-BR")} kg)</div>
</div>

<h2>3. Veículo e Motorista</h2>
<div class="grid">
  <div><b>Placa:</b> ${form.placa_veiculo || "-"}</div>
  <div><b>Modelo:</b> ${form.veiculo_modelo || "-"}</div>
  <div><b>Motorista:</b> ${form.motorista_nome || "-"}</div>
  <div><b>CPF:</b> ${form.motorista_cpf || "-"}</div>
</div>

<h2>4. Valor e Forma de Pagamento</h2>
<div class="grid">
  <div><b>Valor por tonelada:</b> ${fmt(valorTon)}</div>
  <div><b>Peso transportado:</b> ${pesoTon.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</div>
</div>
<div class="total-box"><b>Valor total do frete:</b> ${fmt(valorTotal)} — Vencimento à vista, em nome do CONTRATADO.</div>

<h2>5. Obrigações do Contratado</h2>
<p>O CONTRATADO se obriga a executar o transporte com diligência, observando legislação de trânsito e RNTRC, zelando pela integridade da carga até a entrega no destino indicado.</p>

<h2>6. Obrigações da Contratante</h2>
<p>A CONTRATANTE se obriga a efetuar o pagamento do valor pactuado conforme cláusula 4ª, mediante apresentação de comprovante de entrega da carga.</p>

<h2>7. Disposições Gerais</h2>
<p>${form.observacoes ? form.observacoes : "Aplicam-se a este contrato, no que couberem, as disposições do Código Civil e da Lei nº 11.442/2007."}</p>

<div class="sign">
  <div class="line">CONTRATANTE<br/>SIME TRANSPORTE LTDA</div>
  <div class="line">CONTRATADO<br/>${form.contratado_nome || ""}</div>
</div>
</body></html>`;
}
