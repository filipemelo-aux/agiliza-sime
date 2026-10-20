import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UNCLASSIFIED_ACCOUNT } from "@/lib/contabilidadeExport";

export interface AccountingAccountOption { id: string; codigo: string; nome: string }

export function AccountingAccountsFilter({ options, value, onChange, disabled }: {
  options: AccountingAccountOption[];
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const all = [...options.map((o) => o.id), UNCLASSIFIED_ACCOUNT];
  const selected = value ?? all;
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = options.filter((o) => normalize(`${o.codigo} ${o.nome}`).includes(normalize(search)));
  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id);
    onChange(all.every((s) => next.includes(s)) ? null : next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-full justify-between gap-2 text-xs" aria-label="Planos de contas a incluir">
          <span className="truncate">{value === null ? "Todas as contas de despesa" : `${value.length} selecionados`}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(460px,calc(100vw-32px))] p-3 space-y-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código ou nome" aria-label="Buscar planos de contas" className="h-8 text-xs" />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Selecionar todos</Button>
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>Limpar seleção</Button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {visible.map((o) => (
            <label key={o.id} className="flex items-start gap-2 p-1.5 text-xs cursor-pointer hover:bg-muted">
              <Checkbox className="mt-0.5" checked={selected.includes(o.id)} onCheckedChange={(checked) => toggle(o.id, checked === true)} />
              <span>{o.codigo} — {o.nome}</span>
            </label>
          ))}
          {!visible.length && <p className="p-2 text-xs text-muted-foreground">Nenhum plano encontrado.</p>}
        </div>
        <label className="flex items-center gap-2 border-t border-border pt-2 text-xs cursor-pointer">
          <Checkbox checked={selected.includes(UNCLASSIFIED_ACCOUNT)} onCheckedChange={(checked) => toggle(UNCLASSIFIED_ACCOUNT, checked === true)} />
          Sem classificação
        </label>
      </PopoverContent>
    </Popover>
  );
}