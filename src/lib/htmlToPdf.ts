/** Verifica se um canvas está inteiramente em branco (amostragem em grade). */
function isBlankCanvas(c: HTMLCanvasElement): boolean {
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const step = Math.max(1, Math.floor(Math.min(c.width, c.height) / 40));
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let yy = 0; yy < c.height; yy += step) {
    for (let xx = 0; xx < c.width; xx += step) {
      const i = (yy * c.width + xx) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false;
    }
  }
  return true;
}

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Renderiza um HTML completo (A4) num iframe oculto e devolve o jsPDF (uma página por .doc-page). */
export async function buildHtmlPdf(
  html: string,
  opts?: { orientation?: "portrait" | "landscape"; marginMm?: number; contentWidthMm?: number },
): Promise<jsPDF> {
  const orientation = opts?.orientation ?? "portrait";
  const margin = opts?.marginMm ?? 6;
  const contentWidthMm = opts?.contentWidthMm;
  const pageW = orientation === "landscape" ? 297 : 210;
  const pageH = orientation === "landscape" ? 210 : 297;
  const usableW = pageW - margin * 2, usableH = pageH - margin * 2;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Não foi possível preparar o documento para download.");
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await doc.fonts?.ready;
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? img.decode?.().catch(() => undefined) : new Promise<void>((resolve) => {
          const finish = () => resolve();
          img.onload = img.onerror = finish;
          window.setTimeout(finish, 5000);
        }),
      ),
    );
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".doc-page"));
    const targets = pages.length ? pages : [doc.body];
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation });
    let first = true;
    const putImage = (dataUrl: string, wMm: number, hMm: number) => {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(dataUrl, "JPEG", (pageW - wMm) / 2, margin, wMm, hMm);
    };
    for (const el of targets) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 794 });
      // Largura real do bloco em mm (1px ≈ 25.4/96 mm); nunca maior que a área útil.
      const elWidthMm = Math.min((el as HTMLElement).offsetWidth * 25.4 / 96, opts?.contentWidthMm ?? usableW);
      const pxPerMm = canvas.width / elWidthMm;
      const naturalHeight = canvas.height / pxPerMm;
      if (naturalHeight <= usableH) {
        putImage(canvas.toDataURL("image/jpeg", 0.94), elWidthMm, naturalHeight);
      } else {
        // Conteúdo maior que uma página: fatia o canvas em páginas A4 inteiras.
        const chunkPx = Math.floor(usableH * pxPerMm);
        const slices: HTMLCanvasElement[] = [];
        let y = 0;
        while (y < canvas.height) {
          const h = Math.min(chunkPx, canvas.height - y);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = h;
          const ctx = slice.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
            slices.push(slice);
          }
          y += h;
        }
        // Descarta páginas finais inteiramente em branco (sobras de arredondamento).
        while (slices.length > 1 && isBlankCanvas(slices[slices.length - 1])) slices.pop();
        for (const slice of slices) {
          putImage(slice.toDataURL("image/jpeg", 0.94), elWidthMm, elWidthMm * slice.height / canvas.width);
        }
      }
    }
    return pdf;
  } finally {
    iframe.remove();
  }
}

/** Renderiza um HTML completo (A4) num iframe oculto e baixa como PDF. */
export async function downloadHtmlAsPdf(
  html: string,
  filename: string,
  opts?: { orientation?: "portrait" | "landscape"; marginMm?: number },
): Promise<void> {
  const pdf = await buildHtmlPdf(html, opts);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
