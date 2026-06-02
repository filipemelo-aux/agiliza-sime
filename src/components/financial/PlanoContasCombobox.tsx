import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlanoContaOption {
  id: string;
  codigo: string;
  nome: string;
  tipo?: string;
  conta_pai_id?: string | null;
  tipo_operacional?: string | null;
}

interface PlanoContasComboboxProps {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: PlanoContaOption[];
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  /** Inclui opção "Todas as contas" no topo (uso em filtros) */
  includeAll?: boolean;
  allLabel?: string;
  allValue?: string;
  /** Limita opções exibidas (default: 200) */
  maxResults?: number;
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function PlanoContasCombobox({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Buscar conta contábil...",
  size = "md",
  className,
  includeAll = false,
  allLabel = "Todas as contas",
  allValue = "all",
  maxResults = 200,
}: PlanoContasComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [options]
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const list = !q
      ? sorted
      : sorted.filter((o) => normalize(`${o.codigo} ${o.nome}`).includes(q));
    return list.slice(0, maxResults);
  }, [sorted, search, maxResults]);

  const selected =
    value && value !== allValue ? options.find((o) => o.id === value) : null;

  const heightCls = size === "sm" ? "h-8 text-xs px-2" : "h-9 text-sm";
  const itemTextCls = size === "sm" ? "text-xs" : "text-sm";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", heightCls, className)}
        >
          {selected ? (
            <span className="truncate text-left">
              <span className="font-mono text-[10px] mr-1 text-muted-foreground">{selected.codigo}</span>
              {selected.nome}
            </span>
          ) : includeAll && (value === allValue || !value) ? (
            <span className="flex items-center gap-1 text-left">
              <FolderTree className="h-3 w-3 text-muted-foreground" />
              {allLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite código ou nome..."
            className="h-9"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[320px]">
            {filtered.length === 0 ? (
              <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
            ) : (
              <CommandGroup>
                {includeAll && (
                  <CommandItem
                    value={allValue}
                    onSelect={() => { onChange(allValue); setOpen(false); setSearch(""); }}
                    className={itemTextCls}
                  >
                    <Check className={cn("mr-2 h-3 w-3", value === allValue || !value ? "opacity-100" : "opacity-0")} />
                    <FolderTree className="h-3 w-3 mr-2 text-muted-foreground" />
                    {allLabel}
                  </CommandItem>
                )}
                {filtered.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => { onChange(o.id); setOpen(false); setSearch(""); }}
                    className={itemTextCls}
                  >
                    <Check className={cn("mr-2 h-3 w-3", value === o.id ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-[10px] mr-2 text-muted-foreground">{o.codigo}</span>
                    <span className="truncate">{o.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
