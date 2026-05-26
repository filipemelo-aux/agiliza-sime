import { useRef, useEffect, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Container que permite scroll horizontal (e vertical) arrastando com mouse/touch
 * em qualquer ponto do conteúdo — não só pela barra de rolagem.
 * Mantém o comportamento nativo em links, botões e inputs.
 */
export function DragScroll({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let pointerId: number | null = null;

    const isInteractive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      return !!node.closest(
        'button, a, input, select, textarea, [role="button"], [role="combobox"], [data-no-drag]',
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      // Apenas botão principal do mouse, ou touch/pen
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isInteractive(e.target)) return;
      isDown = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown || pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 5) {
        moved = true;
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      if (moved) {
        el.scrollLeft = scrollLeft - dx;
        el.scrollTop = scrollTop - dy;
        e.preventDefault();
      }
    };

    const end = (e: PointerEvent) => {
      if (pointerId !== null) {
        try { el.releasePointerCapture(pointerId); } catch {}
      }
      isDown = false;
      pointerId = null;
      el.style.cursor = "";
      if (moved) {
        // Evita disparar click em itens depois de arrastar
        const stopClick = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          el.removeEventListener("click", stopClick, true);
        };
        el.addEventListener("click", stopClick, true);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", end);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("pointerleave", end);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("overflow-auto select-none touch-pan-y", className)}
      style={{ WebkitOverflowScrolling: "touch" }}
      {...rest}
    >
      {children}
    </div>
  );
}
