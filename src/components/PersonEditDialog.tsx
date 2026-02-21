import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskPhone, unmaskPhone, maskCNPJ, unmaskCNPJ, maskCPF, unmaskCPF, maskCEP, unmaskCEP, maskCNH, maskName } from "@/lib/masks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Car } from "lucide-react";
import { VehicleFormModal } from "@/components/VehicleFormModal";

const CATEGORIES = [
  { value: "motorista", label: "Motorista" },
  { value: "cliente", label: "Cliente" },
  { value: "proprietario", label: "Proprietário" },
];

const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export interface PersonProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  person_type: string | null;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  category: string;
  email: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  notes: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  pix_key_type: string | null;
  pix_key: string | null;
  services: string[];
}

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  person_type: string;
  cpf: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  category: string;
  cnh_number: string;
  cnh_category: string;
  cnh_expiry: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  notes: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_type: string;
  pix_key_type: string;
  pix_key: string;
}

const emptyForm: FormState = {
  full_name: "",
  phone: "",
  email: "",
  person_type: "cpf",
  cpf: "",
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  category: "motorista",
  cnh_number: "",
  cnh_category: "",
  cnh_expiry: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  notes: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
  bank_account_type: "",
  pix_key_type: "",
  pix_key: "",
};

function AddressFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Endereço</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Rua</Label>
          <Input value={form.address_street} onChange={(e) => setForm((p) => ({ ...p, address_street: maskName(e.target.value) }))} placeholder="Rua / Av." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número</Label>
          <Input value={form.address_number} onChange={(e) => setForm((p) => ({ ...p, address_number: e.target.value }))} placeholder="Nº" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Complemento</Label>
          <Input value={form.address_complement} onChange={(e) => setForm((p) => ({ ...p, address_complement: maskName(e.target.value) }))} placeholder="Apto, Sala..." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bairro</Label>
          <Input value={form.address_neighborhood} onChange={(e) => setForm((p) => ({ ...p, address_neighborhood: maskName(e.target.value) }))} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Cidade</Label>
          <Input value={form.address_city} onChange={(e) => setForm((p) => ({ ...p, address_city: maskName(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">UF</Label>
          <Select value={form.address_state || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, address_state: v === "__none__" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CEP</Label>
          <Input value={form.address_zip} maxLength={9} onChange={(e) => setForm((p) => ({ ...p, address_zip: maskCEP(e.target.value) }))} placeholder="00000-000" />
        </div>
      </div>
    </>
  );
}

function BankFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Dados Bancários</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Banco</Label>
          <Input value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: maskName(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Agência</Label>
          <Input value={form.bank_agency} onChange={(e) => setForm((p) => ({ ...p, bank_agency: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Conta</Label>
          <Input value={form.bank_account} onChange={(e) => setForm((p) => ({ ...p, bank_account: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo de Conta</Label>
          <Select value={form.bank_account_type || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, bank_account_type: v === "__none__" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              <SelectItem value="corrente">Corrente</SelectItem>
              <SelectItem value="poupanca">Poupança</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo Chave PIX</Label>
          <Select value={form.pix_key_type || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, pix_key_type: v === "__none__" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              <SelectItem value="cpf">CPF</SelectItem>
              <SelectItem value="cnpj">CNPJ</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
              <SelectItem value="random">Aleatória</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chave PIX</Label>
          <Input value={form.pix_key} onChange={(e) => setForm((p) => ({ ...p, pix_key: e.target.value }))} />
        </div>
      </div>
    </>
  );
}

function CNHFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Habilitação (CNH)</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nº CNH</Label>
          <Input value={form.cnh_number} maxLength={11} onChange={(e) => setForm((p) => ({ ...p, cnh_number: maskCNH(e.target.value) }))} placeholder="00000000000" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Categoria</Label>
          <Select value={form.cnh_category || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, cnh_category: v === "__none__" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Cat." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              {CNH_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Validade</Label>
          <Input type="date" value={form.cnh_expiry} onChange={(e) => setForm((p) => ({ ...p, cnh_expiry: e.target.value }))} />
        </div>
      </div>
    </>
  );
}

function personToForm(person: PersonProfile): FormState {
  return {
    full_name: person.full_name ? maskName(person.full_name) : "",
    phone: maskPhone(person.phone || ""),
    email: person.email || "",
    person_type: person.category === "motorista" ? "cpf" : (person.person_type || "cpf"),
    cpf: "",
    cnpj: person.cnpj ? maskCNPJ(person.cnpj) : "",
    razao_social: person.razao_social ? maskName(person.razao_social) : "",
    nome_fantasia: person.nome_fantasia ? maskName(person.nome_fantasia) : "",
    category: person.category || "motorista",
    cnh_number: "",
    cnh_category: "",
    cnh_expiry: "",
    address_street: person.address_street ? maskName(person.address_street) : "",
    address_number: person.address_number || "",
    address_complement: person.address_complement || "",
    address_neighborhood: person.address_neighborhood ? maskName(person.address_neighborhood) : "",
    address_city: person.address_city ? maskName(person.address_city) : "",
    address_state: person.address_state || "",
    address_zip: person.address_zip ? maskCEP(person.address_zip) : "",
    notes: person.notes || "",
    bank_name: person.bank_name || "",
    bank_agency: person.bank_agency || "",
    bank_account: person.bank_account || "",
    bank_account_type: person.bank_account_type || "",
    pix_key_type: person.pix_key_type || "",
    pix_key: person.pix_key || "",
  };
}

function formToPayload(form: FormState) {
  const isMotorista = form.category === "motorista";
  return {
    full_name: form.full_name.trim(),
    phone: unmaskPhone(form.phone) || null,
    email: form.email.trim() || null,
    person_type: isMotorista ? "cpf" : form.person_type,
    cnpj: !isMotorista && form.person_type === "cnpj" ? unmaskCNPJ(form.cnpj) : null,
    razao_social: !isMotorista && form.person_type === "cnpj" ? form.razao_social.trim() || null : null,
    nome_fantasia: !isMotorista && form.person_type === "cnpj" ? form.nome_fantasia.trim() || null : null,
    category: form.category,
    address_street: form.address_street.trim() || null,
    address_number: form.address_number.trim() || null,
    address_complement: form.address_complement.trim() || null,
    address_neighborhood: form.address_neighborhood.trim() || null,
    address_city: form.address_city.trim() || null,
    address_state: form.address_state || null,
    address_zip: form.address_zip ? unmaskCEP(form.address_zip) : null,
    notes: form.notes.trim() || null,
    bank_name: form.bank_name.trim() || null,
    bank_agency: form.bank_agency.trim() || null,
    bank_account: form.bank_account.trim() || null,
    bank_account_type: form.bank_account_type || null,
    pix_key_type: form.pix_key_type || null,
    pix_key: form.pix_key.trim() || null,
  };
}

// ---- EDIT DIALOG ----
interface PersonEditDialogProps {
  person: PersonProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PersonEditDialog({ person, open, onOpenChange, onSaved }: PersonEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);

  useEffect(() => {
    if (person) {
      const f = personToForm(person);
      if (person.category === "motorista") {
        supabase
          .from("driver_documents")
          .select("cnh_number, cnh_category, cnh_expiry, cpf")
          .eq("user_id", person.user_id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setForm({ ...f, cnh_number: data.cnh_number || "", cnh_category: data.cnh_category || "", cnh_expiry: data.cnh_expiry || "", cpf: maskCPF(data.cpf || "") });
            } else {
              setForm(f);
            }
          });
      } else {
        setForm(f);
      }
    }
  }, [person]);

  const handleSave = async () => {
    if (!person) return;
    if (!form.full_name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(formToPayload(form) as any)
        .eq("id", person.id);
      if (error) throw error;

      // Save CNH for motorista
      if (form.category === "motorista") {
        const hasCnhData = form.cnh_number || form.cpf || form.cnh_category || form.cnh_expiry;
        if (hasCnhData) {
          const docPayload = {
            user_id: person.user_id,
            cpf: unmaskCPF(form.cpf) || null,
            cnh_number: form.cnh_number || null,
            cnh_category: form.cnh_category || null,
            cnh_expiry: form.cnh_expiry || null,
          };
          const { data: existing } = await supabase
            .from("driver_documents")
            .select("id")
            .eq("user_id", person.user_id)
            .maybeSingle();

          if (existing) {
            await supabase.from("driver_documents").update(docPayload).eq("user_id", person.user_id);
          } else {
            await supabase.from("driver_documents").insert(docPayload);
          }
        }
      }

      toast({ title: "Cadastro atualizado!" });
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Editar Cadastro</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="px-6 pb-6">
              <PersonFormFields form={form} setForm={setForm} isEdit onAddVehicle={person?.category === "motorista" ? () => setVehicleModalOpen(true) : undefined} />
              <Button className="w-full mt-4" onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {person && (
        <VehicleFormModal
          open={vehicleModalOpen}
          onOpenChange={setVehicleModalOpen}
          vehicleId={null}
          onSaved={onSaved}
          defaultDriverId={person.user_id}
        />
      )}
    </>
  );
}

// ---- CREATE DIALOG ----
interface PersonCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultCategory?: string;
}

export function PersonCreateDialog({ open, onOpenChange, onCreated, defaultCategory }: PersonCreateDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm, category: defaultCategory || "motorista" });
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, category: defaultCategory || "motorista" });
      setCreatedUserId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doCreate = async (): Promise<string | null> => {
    if (!form.full_name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return null;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const profileUserId = crypto.randomUUID();
      const payload = { ...formToPayload(form), user_id: profileUserId };
      const { error } = await supabase.from("profiles").insert(payload as any);
      if (error) throw error;

      if (form.category === "motorista") {
        const hasCnhData = form.cnh_number || form.cpf || form.cnh_category || form.cnh_expiry;
        if (hasCnhData) {
          await supabase.from("driver_documents").insert({
            user_id: profileUserId,
            cpf: unmaskCPF(form.cpf) || null,
            cnh_number: form.cnh_number || null,
            cnh_category: form.cnh_category || null,
            cnh_expiry: form.cnh_expiry || null,
          });
        }
      }

      setCreatedUserId(profileUserId);
      return profileUserId;
    } catch (error: any) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const uid = await doCreate();
    if (uid) {
      toast({ title: "Cadastro criado com sucesso!" });
      onOpenChange(false);
      onCreated();
    }
  };

  const handleCreateAndAddVehicle = async () => {
    const uid = await doCreate();
    if (uid) {
      toast({ title: "Cadastro criado! Agora cadastre o veículo." });
      onOpenChange(false);
      onCreated();
      setVehicleModalOpen(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Novo Cadastro</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="px-6 pb-6">
              <PersonFormFields form={form} setForm={setForm} onAddVehicle={form.category === "motorista" ? handleCreateAndAddVehicle : undefined} />
              <Button className="w-full mt-4" onClick={handleCreate} disabled={loading}>
                {loading ? "Criando..." : "Criar Cadastro"}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {createdUserId && (
        <VehicleFormModal
          open={vehicleModalOpen}
          onOpenChange={setVehicleModalOpen}
          vehicleId={null}
          onSaved={onCreated}
          defaultDriverId={createdUserId}
        />
      )}
    </>
  );
}

// ---- SHARED FORM FIELDS ----
function PersonFormFields({ form, setForm, isEdit, onAddVehicle }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; isEdit?: boolean; onAddVehicle?: () => void }) {
  const isMotorista = form.category === "motorista";
  const isProprietario = form.category === "proprietario";
  const showAddress = form.category === "cliente" || form.category === "fornecedor" || form.category === "proprietario";
  const showBank = form.category === "motorista" || form.category === "fornecedor" || form.category === "proprietario";
  const showCNPJ = !isMotorista && form.person_type === "cnpj";
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState("");

  const handleCnpjLookup = useCallback(async (cnpjValue?: string) => {
    const raw = unmaskCNPJ(cnpjValue || form.cnpj);
    if (raw.length !== 14) {
      setCnpjError("CNPJ deve ter 14 dígitos");
      return;
    }
    setCnpjLoading(true);
    setCnpjError("");
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) {
        setCnpjError("CNPJ não encontrado");
        return;
      }
      const data = await res.json();
      setForm((p) => ({
        ...p,
        razao_social: data.razao_social ? maskName(data.razao_social) : p.razao_social,
        nome_fantasia: data.nome_fantasia ? maskName(data.nome_fantasia) : p.nome_fantasia,
        full_name: data.nome_fantasia ? maskName(data.nome_fantasia) : data.razao_social ? maskName(data.razao_social) : p.full_name,
        phone: data.ddd_telefone_1 ? maskPhone(data.ddd_telefone_1.replace(/\D/g, "")) : p.phone,
        email: data.email && data.email !== "null" ? data.email.toLowerCase() : p.email,
        address_street: data.logradouro ? maskName(data.logradouro) : p.address_street,
        address_number: data.numero || p.address_number,
        address_complement: data.complemento || p.address_complement,
        address_neighborhood: data.bairro ? maskName(data.bairro) : p.address_neighborhood,
        address_city: data.municipio ? maskName(data.municipio) : p.address_city,
        address_state: data.uf || p.address_state,
        address_zip: data.cep ? maskCEP(data.cep.replace(/\D/g, "")) : p.address_zip,
      }));
    } catch {
      setCnpjError("Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [form.cnpj, setForm]);

  return (
    <div className="space-y-3 pt-2">
      {/* Category */}
      <div className="space-y-1">
        <Label className="text-xs">Categoria *</Label>
        <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v, person_type: v === "motorista" ? "cpf" : p.person_type }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Person Type toggle buttons - only for non-motorista */}
      {!isMotorista && (
        <div className="space-y-1">
          <Label className="text-xs">Tipo de Pessoa</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={form.person_type === "cpf" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setForm((p) => ({ ...p, person_type: "cpf" }))}
            >
              Pessoa Física (CPF)
            </Button>
            <Button
              type="button"
              variant={form.person_type === "cnpj" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setForm((p) => ({ ...p, person_type: "cnpj" }))}
            >
              Pessoa Jurídica (CNPJ)
            </Button>
          </div>
        </div>
      )}

      {/* CPF - moved before name */}
      {(isMotorista || form.person_type === "cpf") && (
        <div className="space-y-1">
          <Label className="text-xs">CPF</Label>
          <Input value={form.cpf} maxLength={14} onChange={(e) => setForm((p) => ({ ...p, cpf: maskCPF(e.target.value) }))} placeholder="000.000.000-00" />
        </div>
      )}

      {/* CNPJ with auto-lookup - moved before name */}
      {showCNPJ && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">CNPJ</Label>
            <div className="flex gap-2">
              <Input
                value={form.cnpj}
                maxLength={18}
                onChange={(e) => {
                  setCnpjError("");
                  const masked = maskCNPJ(e.target.value);
                  const raw = unmaskCNPJ(masked);
                  setForm((p) => ({ ...p, cnpj: masked }));
                  if (raw.length === 14) {
                    handleCnpjLookup(masked);
                  }
                }}
                placeholder="00.000.000/0000-00"
                className="flex-1"
              />
              {cnpjLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Razão Social</Label>
              <Input value={form.razao_social} onChange={(e) => setForm((p) => ({ ...p, razao_social: maskName(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome Fantasia</Label>
              <Input value={form.nome_fantasia} onChange={(e) => setForm((p) => ({ ...p, nome_fantasia: maskName(e.target.value) }))} />
            </div>
          </div>
        </>
      )}

      {/* Name */}
      <div className="space-y-1">
        <Label className="text-xs">{showCNPJ ? "Nome / Razão Social *" : "Nome Completo *"}</Label>
        <Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: maskName(e.target.value) }))} />
      </div>

      {/* Phone + Email */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Telefone</Label>
          <Input value={form.phone} maxLength={15} onChange={(e) => setForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
        </div>
      </div>

      {/* CNH - motorista only */}
      {isMotorista && <CNHFields form={form} setForm={setForm} />}

      {/* Vehicle management note - motorista edit only */}
      {isMotorista && onAddVehicle && (
        <div className="pt-1">
          <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={onAddVehicle}>
            <Car className="h-4 w-4" />
            Cadastrar Veículo para este Motorista
          </Button>
        </div>
      )}

      {/* Address - clients, suppliers, and proprietários */}
      {showAddress && <AddressFields form={form} setForm={setForm} />}

      {/* Bank - drivers, suppliers, and proprietários */}
      {showBank && <BankFields form={form} setForm={setForm} />}

      {/* Notes */}
      <Separator />
      <div className="space-y-1">
        <Label className="text-xs">Observações</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Anotações..." />
      </div>
    </div>
  );
}
