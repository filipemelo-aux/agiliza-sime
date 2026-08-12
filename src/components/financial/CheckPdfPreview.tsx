import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

interface Props {
  bytes: Uint8Array | null;
  className?: string;
}

/** Renderiza a 1ª página de um PDF em canvas (evita tela branca de iframes com blob). */
export function CheckPdfPreview({ bytes, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    let loadingTask: { promise: Promise<any>; destroy: () => Promise<void> } | null = null;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const render = async () => {
      setLoading(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        loadingTask = pdfjs.getDocument({ data: bytes.slice() });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const viewport = page.getViewport({ scale: 1.6 });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a visualização");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          console.error("Falha ao renderizar preview do cheque", error);
          toast.error("Não foi possível exibir a pré-visualização");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [bytes]);

  return (
    <div className={`relative overflow-auto rounded-md border border-border bg-muted/30 p-3 ${className || "h-[600px]"}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="mx-auto block h-auto w-full max-w-[794px] bg-background shadow-sm"
        aria-label="Visualização do cheque"
      />
    </div>
  );
}
