import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SearchFilterCardProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  label?: string;
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
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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