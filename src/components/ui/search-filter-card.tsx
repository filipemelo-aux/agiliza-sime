import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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
  label = "Filtros",
}: SearchFilterCardProps) {
  return (
    <section
      aria-label={label}
      className={cn("rounded-lg border border-border bg-card p-3 shadow-sm", className)}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-2 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground lg:flex">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center [&_input]:h-8 [&_button]:h-8 [&_[role=combobox]]:h-8",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}