import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskPhone, unmaskPhone, maskCNPJ, unmaskCNPJ } from "@/lib/masks";

const CATEGORIES = [
  { value: "motorista", label: "Motorista" },
  { value: "cliente", label: "Cliente" },
  { value: "fornecedor", label: "Fornecedor" },
];

interface PersonProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  person_type: string | null;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  category: string;
}

interface PersonEditDialogProps {
  person: PersonProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PersonEditDialog({ person, open, onOpenChange, onSaved }: PersonEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    person_type: "cpf",
    cnpj: "",
    razao_social: "",
    nome_fantasia: "",
    category: "motorista",
  });

  useEffect(() => {
    if (person) {
      setForm({
        full_name: person.full_name || "",
        phone: maskPhone(person.phone || ""),
        person_type: person.person_type || "cpf",
        cnpj: person.cnpj ? maskCNPJ(person.cnpj) : "",
        razao_social: person.razao_social || "",
        nome_fantasia: person.nome_fantasia || "",
        category: person.category || "motorista",
      });
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
        .update({
          full_name: form.full_name.trim(),
          phone: unmaskPhone(form.phone),
          person_type: form.person_type,
          cnpj: form.person_type === "cnpj" ? unmaskCNPJ(form.cnpj) : null,
          razao_social: form.person_type === "cnpj" ? form.razao_social.trim() : null,
          nome_fantasia: form.person_type === "cnpj" ? form.nome_fantasia.trim() : null,
          category: form.category,
        } as any)
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Cadastro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nome Completo *</Label>
            <Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={form.phone}
              maxLength={15}
              onChange={(e) => setForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de Pessoa</Label>
            <Select value={form.person_type} onValueChange={(v) => setForm((p) => ({ ...p, person_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.person_type === "cnpj" && (
            <>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  maxLength={18}
                  onChange={(e) => setForm((p) => ({ ...p, cnpj: maskCNPJ(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>Razão Social</Label>
                <Input value={form.razao_social} onChange={(e) => setForm((p) => ({ ...p, razao_social: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia} onChange={(e) => setForm((p) => ({ ...p, nome_fantasia: e.target.value }))} />
              </div>
            </>
          )}

          <Button className="w-full" onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
