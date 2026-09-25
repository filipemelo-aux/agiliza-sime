// Converte um documento HTML de impressão em PDF e baixa o arquivo direto,
// sem abrir o diálogo da impressora. Aplica margens de 12 mm em todas as páginas.
// NÃO usar para cheques (layout próprio em checkPdf.ts).
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

const MARGIN_MM = 12;

function sanitizeFileName(name: string) {
  return (name || "documento")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\-. ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 90) || "documento";
}

function detectLandscape(html: string) {
  return /@page[^{]*\{[^}]*landscape/i.test(html) || /size:\s*A4\s+landscape/i.test(html);
}

export async function downloadHtmlAsPdf(html: string, fileName: string, opts?: { landscape?: boolean }) {
  const landscape = opts?.landscape ?? detectLandscape(html);
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const contentWmm = pageW - MARGIN_MM * 2;
  const contentHmm = pageH - MARGIN_MM * 2;
  const widthPx = Math.round(contentWmm * 3.78); // 96dpi

  const loading = toast.loading("Gerando PDF...");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  Object.assign(iframe.style, { position: "fixed", left: "-10000px", top: "0", width: `${widthPx}px`, height: "1000px", border: "0" });
  // remove scripts (evita window.print automático) e força margem zero no corpo — a margem vem do PDF
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/head>/i, `<style>html,body{margin:0!important;padding:0!important;background:#fff!important;width:${widthPx}px!important}.no-print,.toolbar{display:none!important}</style></head>`);
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = clean;
    });
    const doc = iframe.contentDocument!;
    await Promise.all(Array.from(doc.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
    await new Promise((r) => setTimeout(r, 150));
    const body = doc.body;
    iframe.style.height = `${body.scrollHeight + 20}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: widthPx, width: widthPx });

    const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
    const pxPerMm = canvas.width / contentWmm;
    const pageHeightPx = Math.floor(contentHmm * pxPerMm);
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_MM, MARGIN_MM, contentWmm, sliceH / pxPerMm);
      first = false;
      y += sliceH;
    }
    pdf.save(`${sanitizeFileName(fileName)}.pdf`);
    toast.success("PDF salvo", { id: loading });
  } catch (e: any) {
    console.error(e);
    toast.error("Não foi possível gerar o PDF: " + (e?.message || ""), { id: loading });
  } finally {
    iframe.remove();
  }
}

/** Extrai o <title> do HTML para usar como nome do arquivo. */
export function titleFromHtml(html: string, fallback = "documento") {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || fallback;
}
