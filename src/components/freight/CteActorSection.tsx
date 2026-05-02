import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2 } from "lucide-react";
import { maskCNPJ, unmaskCNPJ, maskName } from "@/lib/masks";
import { PersonSearchInput } from "./PersonSearchInput";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export interface CteActorFields {
  [key: string]: any;
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <Building2 className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">{title}</h3>
    </div>
  );
}

interface ActorSectionProps {
  title: string;
  prefix: string;
  form: CteActorFields;
  set: (key: string, value: any) => void;
  searchCategories?: string[];
}

export function CteActorSection({
  title,
  prefix,
  form,
  set,
  searchCategories,
}: ActorSectionProps) {
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState("");

  const lookupCnpj = useCallback(async (raw: string) => {
    if (raw.length !== 14) return;
    setCnpjLoading(true);
    setCnpjError("");
    try {
      const { lookupCnpj } = await import("@/lib/cnpjLookup");
      const data = await lookupCnpj(raw);
      if (data.razao_social) set(`${prefix}_nome`, maskName(data.razao_social));
      if (data.uf) set(`${prefix}_uf`, data.uf);
      if (data.logradouro) {
        const endereco = `${maskName(data.logradouro)}${data.numero ? `, ${data.numero}` : ""}${data.bairro ? ` - ${maskName(data.bairro)}` : ""}`;
        set(`${prefix}_endereco`, endereco);
      }
    } catch {
      setCnpjError("Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [prefix, set]);

  return (
    <section className="space-y-4">
      <SectionHeader title={title} />
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Buscar no cadastro</Label>
        <PersonSearchInput
          categories={searchCategories}
          placeholder={`Buscar ${title.toLowerCase()} cadastrado...`}
          selectedName={form[`${prefix}_nome`] || undefined}
          onSelect={(person) => {
            set(`${prefix}_nome`, person.razao_social || person.full_name);
            if (person.cnpj) set(`${prefix}_cnpj`, maskCNPJ(person.cnpj));
            if (person.inscricao_estadual) set(`${prefix}_ie`, person.inscricao_estadual);
            if (person.address_state) set(`${prefix}_uf`, person.address_state);
            const endereco = [person.address_street, person.address_number, person.address_neighborhood].filter(Boolean).join(", ");
            if (endereco) set(`${prefix}_endereco`, endereco);
          }}
          onClear={() => {
            set(`${prefix}_nome`, "");
            set(`${prefix}_cnpj`, "");
            set(`${prefix}_ie`, "");
            set(`${prefix}_endereco`, "");
            set(`${prefix}_uf`, "");
            set(`${prefix}_municipio_ibge`, "");
          }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-3">
        <div className="sm:col-span-4 space-y-1.5">
          <Label className="text-xs">Nome / Razão Social</Label>
          <Input value={form[`${prefix}_nome`] || ""} onChange={(e) => set(`${prefix}_nome`, maskName(e.target.value))} placeholder="Nome completo ou razão social" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">UF</Label>
          <Select value={form[`${prefix}_uf`] || undefined} onValueChange={(v) => set(`${prefix}_uf`, v)}>
            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">CNPJ / CPF</Label>
          <div className="relative">
            <Input
              value={form[`${prefix}_cnpj`] || ""}
              onChange={(e) => {
                setCnpjError("");
                const masked = maskCNPJ(e.target.value);
                set(`${prefix}_cnpj`, masked);
                const raw = unmaskCNPJ(masked);
                if (raw.length === 14) lookupCnpj(raw);
              }}
              maxLength={18}
              placeholder="00.000.000/0000-00"
            />
            {cnpjLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Inscrição Estadual</Label>
          <Input value={form[`${prefix}_ie`] || ""} onChange={(e) => set(`${prefix}_ie`, e.target.value)} placeholder="IE" />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Cód. Município IBGE</Label>
          <Input value={form[`${prefix}_municipio_ibge`] || ""} onChange={(e) => set(`${prefix}_municipio_ibge`, e.target.value)} placeholder="0000000" />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Endereço</Label>
          <Input value={form[`${prefix}_endereco`] || ""} onChange={(e) => set(`${prefix}_endereco`, e.target.value)} placeholder="Logradouro, nº, bairro" />
        </div>
      </div>
    </section>
  );
}
