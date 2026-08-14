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

function getScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

export function GlobalToolbar({ actions, selectedCount, children, className }: GlobalToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const target = getScrollParent(ref.current);
    const read = () =>
      setScrolled((target instanceof Window ? window.scrollY : target.scrollTop) > 0);
    read();
    target.addEventListener("scroll", read, { passive: true });
    return () => target.removeEventListener("scroll", read as EventListener);
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "sticky top-0 z-40 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 transition-shadow duration-200",
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
              className="h-8 text-xs gap-1.5 disabled:opacity-40"
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {a.label}
            </Button>
          );
        })}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
      <span className="ml-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {selectedCount > 0 ? `${selectedCount} selecionado(s)` : "Nenhum selecionado"}
      </span>
    </div>
  );
}
