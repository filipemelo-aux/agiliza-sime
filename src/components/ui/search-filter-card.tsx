import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SearchFilterCardProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  label?: string;
}

interface FilterPrimaryRowProps {
  children: ReactNode;
  className?: string;
}

/** Primeira linha dos filtros: período à esquerda e empresa à direita. */
export function FilterPrimaryRow({ children, className }: FilterPrimaryRowProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-end justify-end gap-2", className)}>
      {children}
    </div>
  );
}

interface FilterFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** Campo de filtro com o nome acima do controle — padrão de todos os cards "Filtrar". */
export function FilterField({ label, children, className }: FilterFieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
}

/** Faixa única para busca, período, ordenação e filtros de listagens. */
export function SearchFilterCard({
  children,
  className,
  contentClassName,
  label = "Filtrar",
}: SearchFilterCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        aria-label={label}
        className={cn("overflow-hidden rounded-md border border-border bg-card shadow-sm", className)}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-11 w-full items-center justify-start gap-2 rounded-none px-3 text-sm font-medium hover:bg-muted/40"
            aria-label={`${open ? "Recolher" : "Expandir"} filtros`}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
            <span>{label}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-2 border-t border-border p-3 sm:flex-row sm:flex-wrap sm:items-end [&_input]:h-8 [&_button]:h-8 [&_[role=combobox]]:h-8",
              contentClassName,
            )}
          >
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}