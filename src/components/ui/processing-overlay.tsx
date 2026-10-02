import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Full-screen blocking overlay with elapsed timer, shown while awaiting a server operation. */
export function ProcessingOverlay({ open, label = "Processando..." }: { open: boolean; label?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!open) { setSecs(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [open]);
  if (!open) return null;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
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
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">Tempo decorrido: {mm}:{ss}</p>
        <p className="text-[10px] text-muted-foreground">Aguarde, não feche esta tela.</p>
      </div>
    </div>,
    document.body,
  );
}
