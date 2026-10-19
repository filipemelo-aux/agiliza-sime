import { createPortal } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

/** Full-screen blocking overlay naming the operation in progress. */
export function ProcessingOverlay({ open, label = "Processando...", status = "processing" }: { open: boolean; label?: string; status?: "processing" | "success" }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in pointer-events-auto cursor-wait"
      role="alertdialog" aria-busy="true" aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-8 py-6 shadow-lg transition-all">
        <div className="relative h-14 w-14">
          {status === "success" ? (
            <CheckCircle2 className="absolute inset-0 h-14 w-14 text-green-600 animate-scale-in" />
          ) : (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-muted" />
              <Loader2 className="absolute inset-0 h-14 w-14 animate-spin text-primary" />
            </>
          )}
        </div>
        <p className="text-sm font-medium text-foreground text-center max-w-sm">
          {status === "success" ? "Concluído com sucesso!" : "Aguarde, não feche esta tela."}
        </p>
        <p className="text-[10px] text-muted-foreground text-center max-w-sm">{status === "success" ? "" : label}</p>
      </div>
    </div>,
    document.body,
  );
}
