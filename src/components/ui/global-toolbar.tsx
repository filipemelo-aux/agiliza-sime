import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  /** classes extras aplicadas ao botão (ex.: cores de destaque por tipo de match) */
  className?: string;
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
  /** quando a tela estreita (abaixo de xl), coloca os filtros em uma linha acima das ações, sem quebra dos botões de ação */
  filtersFirstOnMobile?: boolean;
  /** no desktop mostra só ícone (legenda no hover); no mobile mantém legenda discreta abaixo do ícone */
  iconOnlyOnDesktop?: boolean;
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

export function GlobalToolbar({ actions, selectedCount, children, className, filtersFirstOnMobile = false, iconOnlyOnDesktop = false }: GlobalToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tip, setTip] = useState<{ key: string; label: string; x: number; y: number } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ToolbarAction | null>(null);
  const [coarse, setCoarse] = useState(false);


  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);

  // auto-oculta a legenda/estado pendente no mobile após 3s
  useEffect(() => {
    if (!coarse || (!tip && !pendingKey)) return;
    const t = window.setTimeout(() => { setTip(null); setPendingKey(null); }, 3000);
    return () => window.clearTimeout(t);
  }, [coarse, tip, pendingKey]);

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

  const renderAction = (a: ToolbarAction) => {
    const enabled = isActionEnabled(a.mode, selectedCount) && !a.disabled;
    const Icon = a.icon;
    const iconOnly = iconOnlyOnDesktop && !!Icon;
    const isPending = pendingKey === a.key;
    const showTip = (el: HTMLElement, label: string) => {
      const r = el.getBoundingClientRect();
      setTip({ key: a.key, label, x: r.left + r.width / 2, y: r.bottom + 4 });
    };
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (coarse && iconOnly) {
        e.stopPropagation();
        setTip(null);
        setPendingKey(null);
        setConfirmAction(a);
        return;
      }
      a.onClick();
    };

    return (
      <div
        key={a.key}
        className="relative shrink-0"
        onMouseEnter={iconOnly && !coarse ? (e) => showTip(e.currentTarget, a.label) : undefined}
        onMouseLeave={iconOnly && !coarse ? () => setTip(null) : undefined}
      >
        <Button
          type="button"
          size="sm"
          variant={a.variant ?? "outline"}
          disabled={!enabled}
          onClick={handleClick}
          title={iconOnly ? undefined : a.label}
          aria-label={a.label}
          className={cn(
            "h-9 md:h-8 text-xs gap-1.5 disabled:opacity-40",
            iconOnly && "px-2 gap-0 max-md:h-9 max-md:w-9 max-md:px-0 max-md:justify-center",
            isPending && "ring-2 ring-ring",
            a.className,
          )}
        >
          {Icon && <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />}
          {Icon ? <span className="sr-only">{a.label}</span> : <span>{a.label}</span>}
        </Button>
      </div>
    );
  };

  const countSpan = (
    <span className="ml-2 self-center text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
      {selectedCount > 0 ? `${selectedCount} sel.` : <span className="max-md:hidden">Nenhum selecionado</span>}
    </span>
  );

  const tooltipPortal = tip && createPortal(
    <div
      style={{ position: "fixed", left: tip.x, top: tip.y, transform: "translateX(-50%)", zIndex: 9999 }}
      className="pointer-events-none whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md ring-1 ring-border"
    >
      {tip.label}
    </div>,
    document.body
  );

  const confirmDialog = (
    <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
      <AlertDialogContent className="max-w-[320px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{confirmAction?.label}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            Confirmar esta ação{selectedCount > 0 ? ` para ${selectedCount} item(ns) selecionado(s)` : ""}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-9 text-xs">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="h-9 text-xs"
            onClick={() => {
              const act = confirmAction;
              setConfirmAction(null);
              act?.onClick();
            }}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );



  // Ordena: ações habilitadas primeiro (preservando ordem original dentro de cada grupo)
  const orderedActions = [...actions].filter((a) => !a.hidden).sort((a, b) => {
    const aEn = isActionEnabled(a.mode, selectedCount) && !a.disabled;
    const bEn = isActionEnabled(b.mode, selectedCount) && !b.disabled;
    if (aEn === bEn) return 0;
    return aEn ? -1 : 1;
  });

  if (filtersFirstOnMobile) {
    // Mobile: duas linhas (filtros em cima, ações embaixo).
    // Desktop: uma linha — ações, busca (divisor) e filtros, da esquerda p/ direita.
    return (
      <>
        <div
          ref={ref}
          className={cn(
            "sticky top-0 z-40 flex flex-col gap-1.5 md:flex-row md:flex-nowrap md:items-center md:gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 transition-shadow duration-200",
            scrolled ? "shadow-md border-b-border" : "shadow-none",
            className,
          )}
        >
          {/* Ações: mobile embaixo (order-2), desktop primeiro (order-1) */}
          <div className="order-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto md:order-1 md:overflow-visible">
            {orderedActions.map(renderAction)}
            {countSpan}
          </div>
          {/* Filtros + busca: mobile em cima (order-1), desktop depois das ações (order-2) */}
          {children && (
            <div className="order-1 flex flex-wrap items-center gap-1.5 md:order-2 md:flex-nowrap md:overflow-x-auto">
              {children}
            </div>
          )}
        </div>
        {tooltipPortal}
        {confirmDialog}

      </>
    );
  }


  return (
    <>
      <div
        ref={ref}
        className={cn(
          "sticky top-0 z-40 flex flex-nowrap overflow-x-auto md:overflow-visible md:flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 transition-shadow duration-200",
          scrolled ? "shadow-md border-b-border" : "shadow-none",
          className,
        )}
      >
        {orderedActions.map(renderAction)}
        {children && <div className="contents max-md:ml-0">{children}</div>}
        {countSpan}
      </div>
      {tooltipPortal}
      {confirmDialog}

    </>
  );
}

interface ToolbarIconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  /** exibe a legenda ao lado do ícone no desktop (texto discreto, muted) */
  showLabel?: boolean;
}

/** Botão de filtro: ícone + legenda discreta no desktop; no mobile só ícone (legenda no toque). */
export function ToolbarIconButton({ label, icon: Icon, onClick, active, disabled, className, showLabel = false }: ToolbarIconButtonProps) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);

  // auto-oculta a legenda/estado pendente no mobile após 3s
  useEffect(() => {
    if (!coarse || (!tip && !pending)) return;
    const t = window.setTimeout(() => { setTip(null); setPending(false); }, 3000);
    return () => window.clearTimeout(t);
  }, [coarse, tip, pending]);

  const show = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.bottom + 4, text });
  };

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={!coarse && !showLabel ? (e) => show(e.currentTarget, label) : undefined}
      onMouseLeave={!coarse && !showLabel ? () => setTip(null) : undefined}
    >
      <Button
        type="button"
        size="sm"
        variant={active ? "default" : "outline"}
        disabled={disabled}
        aria-label={label}
        onClick={(e) => {
          if (coarse) {
            show(e.currentTarget, label);
            setPending(false);
          }
          onClick();
        }}

        className={cn(
          "h-9 w-9 md:h-8 md:w-8 p-0 justify-center",
          showLabel && "md:w-auto md:px-2 md:gap-1.5",
          pending && "ring-2 ring-ring",
          className,
        )}
      >
        <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        {showLabel ? (
          <span className="hidden md:inline text-[10px] font-normal text-muted-foreground/80">{label}</span>
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </Button>
      {tip && createPortal(
        <div
          style={{ position: "fixed", left: tip.x, top: tip.y, transform: "translateX(-50%)", zIndex: 9999 }}
          className="pointer-events-none whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md ring-1 ring-border"
        >
          {tip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
