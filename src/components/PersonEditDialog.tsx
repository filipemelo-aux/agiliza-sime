import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskPhone, unmaskPhone, maskCNPJ, unmaskCNPJ, maskCPF, unmaskCPF, maskCEP, unmaskCEP } from "@/lib/masks";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES = [
  { value: "motorista", label: "Motorista" },
  { value: "cliente", label: "Cliente" },
  { value: "fornecedor", label: "Fornecedor" },
];

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">Rua</Label>
          <Input value={form.address_street} onChange={(e) => setForm((p) => ({ ...p, address_street: e.target.value }))} placeholder="Rua / Av." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número</Label>
          <Input value={form.address_number} onChange={(e) => setForm((p) => ({ ...p, address_number: e.target.value }))} placeholder="Nº" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Complemento</Label>
          <Input value={form.address_complement} onChange={(e) => setForm((p) => ({ ...p, address_complement: e.target.value }))} placeholder="Apto, Sala..." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bairro</Label>
          <Input value={form.address_neighborhood} onChange={(e) => setForm((p) => ({ ...p, address_neighborhood: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Cidade</Label>
          <Input value={form.address_city} onChange={(e) => setForm((p) => ({ ...p, address_city: e.target.value }))} />
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
        <div className="col-span-2 space-y-1">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Banco</Label>
          <Input value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

function personToForm(person: PersonProfile): FormState {
  return {
    full_name: person.full_name || "",
    phone: maskPhone(person.phone || ""),
    email: person.email || "",
    person_type: person.person_type || "cpf",
    cpf: "",
    cnpj: person.cnpj ? maskCNPJ(person.cnpj) : "",
    razao_social: person.razao_social || "",
    nome_fantasia: person.nome_fantasia || "",
    category: person.category || "motorista",
    address_street: person.address_street || "",
    address_number: person.address_number || "",
    address_complement: person.address_complement || "",
    address_neighborhood: person.address_neighborhood || "",
    address_city: person.address_city || "",
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
  return {
    full_name: form.full_name.trim(),
    phone: unmaskPhone(form.phone),
    email: form.email.trim() || null,
    person_type: form.person_type,
    cnpj: form.person_type === "cnpj" ? unmaskCNPJ(form.cnpj) : null,
    razao_social: form.person_type === "cnpj" ? form.razao_social.trim() || null : null,
    nome_fantasia: form.person_type === "cnpj" ? form.nome_fantasia.trim() || null : null,
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

  useEffect(() => {
    if (person) setForm(personToForm(person));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Editar Cadastro</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <PersonFormFields form={form} setForm={setForm} />
          <Button className="w-full mt-4" onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, category: defaultCategory || "motorista" });
    }
  }, [open, defaultCategory]);

  const handleCreate = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!unmaskPhone(form.phone) || unmaskPhone(form.phone).length < 10) {
      toast({ title: "Telefone é obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const payload = {
        ...formToPayload(form),
        user_id: user.id, // admin creates under their own user_id as placeholder
      };

      const { error } = await supabase.from("profiles").insert(payload as any);
      if (error) throw error;

      toast({ title: "Cadastro criado com sucesso!" });
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Novo Cadastro</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <PersonFormFields form={form} setForm={setForm} />
          <Button className="w-full mt-4" onClick={handleCreate} disabled={loading}>
            {loading ? "Criando..." : "Criar Cadastro"}
          </Button>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---- SHARED FORM FIELDS ----
function PersonFormFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const showAddress = form.category === "cliente" || form.category === "fornecedor";
  const showBank = form.category === "motorista" || form.category === "fornecedor";

  return (
    <div className="space-y-3 pt-2">
      {/* Category */}
      <div className="space-y-1">
        <Label className="text-xs">Categoria *</Label>
        <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Person Type */}
      <div className="space-y-1">
        <Label className="text-xs">Tipo de Pessoa</Label>
        <Select value={form.person_type} onValueChange={(v) => setForm((p) => ({ ...p, person_type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cpf">Pessoa Física (CPF)</SelectItem>
            <SelectItem value="cnpj">Pessoa Jurídica (CNPJ)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Basic Info */}
      <div className="space-y-1">
        <Label className="text-xs">Nome Completo *</Label>
        <Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
      </div>

      {form.person_type === "cnpj" && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">CNPJ</Label>
            <Input value={form.cnpj} maxLength={18} onChange={(e) => setForm((p) => ({ ...p, cnpj: maskCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Razão Social</Label>
              <Input value={form.razao_social} onChange={(e) => setForm((p) => ({ ...p, razao_social: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome Fantasia</Label>
              <Input value={form.nome_fantasia} onChange={(e) => setForm((p) => ({ ...p, nome_fantasia: e.target.value }))} />
            </div>
          </div>
        </>
      )}

      {form.person_type === "cpf" && (
        <div className="space-y-1">
          <Label className="text-xs">CPF</Label>
          <Input value={form.cpf} maxLength={14} onChange={(e) => setForm((p) => ({ ...p, cpf: maskCPF(e.target.value) }))} placeholder="000.000.000-00" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Telefone *</Label>
          <Input value={form.phone} maxLength={15} onChange={(e) => setForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
        </div>
      </div>

      {/* Address - for clients and suppliers */}
      {showAddress && <AddressFields form={form} setForm={setForm} />}

      {/* Bank - for drivers and suppliers */}
      {showBank && <BankFields form={form} setForm={setForm} />}

      {/* Notes */}
      <Separator />
      <div className="space-y-1">
        <Label className="text-xs">Observações</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Anotações sobre este cadastro..." />
      </div>
    </div>
  );
}
