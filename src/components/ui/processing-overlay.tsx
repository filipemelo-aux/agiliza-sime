import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/** Full-screen blocking overlay naming the operation in progress. */
export function ProcessingOverlay({ open, label = "Processando..." }: { open: boolean; label?: string }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in pointer-events-auto cursor-wait"
      role="alertdialog" aria-busy="true" aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-8 py-6 shadow-lg">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-14 w-14 animate-spin text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground text-center max-w-sm">Aguarde, não feche esta tela.</p>
        <p className="text-[10px] text-muted-foreground text-center max-w-sm">{label}</p>
      </div>
    </div>,
    document.body,
  );
}
