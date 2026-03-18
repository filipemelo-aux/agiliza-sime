import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptPdfCanvasViewerProps {
  file: Blob;
  fallbackUrl: string;
  isMobile: boolean;
}

export function ReceiptPdfCanvasViewer({ file, fallbackUrl, isMobile }: ReceiptPdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy?: () => void } | null = null;

    const renderPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdfBytes = await file.arrayBuffer();

        loadingTask = pdfjs.getDocument({
          data: pdfBytes,
          disableWorker: true,
          isEvalSupported: false,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        container.innerHTML = "";

        const availableWidth = Math.min(container.clientWidth || 920, 960);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.max(availableWidth / baseViewport.width, 0.7);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto rounded-md bg-background shadow-sm";

          await page.render({
            canvasContext: context,
            viewport,
            transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          }).promise;

          container.appendChild(canvas);
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("Erro ao renderizar PDF internamente:", err);
        if (!cancelled) {
          setLoading(false);
          setError("Não foi possível exibir o PDF internamente.");
        }
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [file]);

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline" size={isMobile ? "sm" : "default"}>
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              Abrir PDF
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-muted/30">
      {loading && (
        <div className="h-full w-full flex items-center justify-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Renderizando PDF...
          </div>
        </div>
      )}
      <div ref={containerRef} className={`min-h-full p-4 space-y-4 ${loading ? "hidden" : ""}`} />
    </div>
  );
}
