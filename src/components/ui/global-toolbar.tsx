import { useEffect, useRef, useState } from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ToolbarActionMode = "always" | "create" | "single" | "batch" | "single+batch";

export interface ToolbarAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  /** always = sempre ativo | create = só com 0 selecionados (Novo) | single = só 1 selecionado | batch = 1+ | single+batch = 1+ */
  mode: ToolbarActionMode;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  /** desabilita mesmo quando a seleção permitiria */
  disabled?: boolean;
  hidden?: boolean;
}

export function isActionEnabled(mode: ToolbarActionMode, count: number) {
  switch (mode) {
    case "always":
      return true;
    case "create":
      return count === 0;
    case "single":
      return count === 1;
    case "batch":
    case "single+batch":
      return count >= 1;
    default:
      return false;
  }
}


interface GlobalToolbarProps {
  actions: ToolbarAction[];
  selectedCount: number;
  /** conteúdo extra à direita (filtros, busca, totais) */
  children?: React.ReactNode;
  className?: string;
}

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

export function GlobalToolbar({ actions, selectedCount, children, className }: GlobalToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const parent = getScrollParent(ref.current);
    const read = () => setScrolled((parent?.scrollTop ?? 0) > 0 || window.scrollY > 0);
    read();
    parent?.addEventListener("scroll", read, { passive: true });
    window.addEventListener("scroll", read, { passive: true });
    return () => {
      parent?.removeEventListener("scroll", read);
      window.removeEventListener("scroll", read);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "sticky top-0 z-40 flex flex-nowrap overflow-x-auto md:overflow-visible md:flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 transition-shadow duration-200",
        scrolled ? "shadow-md border-b-border" : "shadow-none",
        className
      )}
    >
      {actions
        .filter((a) => !a.hidden)
        .map((a) => {
          const enabled = isActionEnabled(a.mode, selectedCount) && !a.disabled;
          const Icon = a.icon;
          return (
            <Button
              key={a.key}
              type="button"
              size="sm"
              variant={a.variant ?? "outline"}
              disabled={!enabled}
              onClick={a.onClick}
              title={a.label}
              aria-label={a.label}
              className={cn(
                "h-9 md:h-8 text-xs gap-1.5 disabled:opacity-40 shrink-0",
                Icon && "max-md:w-9 max-md:px-0 max-md:justify-center"
              )}
            >
              {Icon && <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />}
              <span className={cn(Icon && "max-md:hidden")}>{a.label}</span>
            </Button>
          );
        })}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2 max-md:hidden">{children}</div>}
      <span className="ml-2 text-[11px] text-muted-foreground whitespace-nowrap max-md:hidden">
        {selectedCount > 0 ? `${selectedCount} selecionado(s)` : "Nenhum selecionado"}
      </span>
    </div>
  );
}
