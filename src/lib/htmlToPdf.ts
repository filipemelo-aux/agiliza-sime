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
import { preparePdfImages, snapshotPdfImages } from "@/lib/pdfImages";

type TextLine = { text: string; x: number; y: number; w: number; h: number };

/** Coleta linhas de texto (em px relativos ao elemento) para a camada de texto selecionável. */
function collectTextLines(el: HTMLElement): TextLine[] {
  const doc = el.ownerDocument;
  const base = el.getBoundingClientRect();
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines: TextLine[] = [];
  const range = doc.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const txt = node.textContent || "";
    const parent = (node as Text).parentElement;
    if (!txt.trim() || !parent) continue;
    const cs = doc.defaultView?.getComputedStyle(parent);
    if (cs && (cs.visibility === "hidden" || cs.display === "none")) continue;
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let cur: TextLine | null = null;
    while ((m = re.exec(txt))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.left - base.left, y = r.top - base.top;
      if (cur && Math.abs(cur.y - y) < r.height / 2 && x >= cur.x + cur.w - 1) {
        cur.text += " " + m[0];
        cur.w = x + r.width - cur.x;
      } else {
        if (cur) lines.push(cur);
        cur = { text: m[0], x, y, w: r.width, h: r.height };
      }
    }
    if (cur) lines.push(cur);
  }
  range.detach?.();
  return lines;
}

const toWinAnsi = (s: string) => s.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, "...").replace(/[^\x20-\xFF]/g, "");

/** Última linha (px) com conteúdo não branco do canvas. */
function contentBottomPx(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = canvas.height - 1; y >= 0; y--) {
    const row = y * canvas.width * 4;
    for (let x = 0; x < canvas.width; x += 2) {
      const i = row + x * 4;
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) return y + 1;
    }
  }
  return 0;
}

/** Renderiza um HTML completo (A4) num iframe oculto e devolve o jsPDF (uma página por .doc-page). */
export async function buildHtmlPdf(
  html: string,
  opts?: { orientation?: "portrait" | "landscape"; marginMm?: number; contentWidthMm?: number },
): Promise<jsPDF> {
  const orientation = opts?.orientation ?? "portrait";
  const margin = opts?.marginMm ?? 6;
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
    await preparePdfImages(doc);
    // Dá tempo ao navegador de pintar as imagens embutidas antes da captura.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))));
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".doc-page"));
    const targets = pages.length ? pages : [doc.body];
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation });
    let first = true;
    const putImage = (dataUrl: string, wMm: number, hMm: number) => {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(dataUrl, "JPEG", (pageW - wMm) / 2, margin, wMm, hMm);
      // Onde termina o conteúdo da última página (mm): permite anexar blocos vetoriais logo abaixo.
      (pdf as any).__contentBottomMm = margin + hMm;
    };
    for (const el of targets) {
      const textLines = collectTextLines(el);
      const firstPageIndex = pdf.getNumberOfPages() - (first ? 1 : 0);
      const paintImages = snapshotPdfImages(el);
      const canvas = await html2canvas(el, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 794,
        width: Math.ceil(el.getBoundingClientRect().width),
        foreignObjectRendering: true,
        onclone: (clonedDoc, clonedEl) => {
          if (clonedEl.classList.contains("doc-page")) {
            clonedDoc.body.replaceChildren(clonedEl);
          }
          // Keep image geometry but do not rely on nested SVG image decoding.
          clonedEl.querySelectorAll<HTMLElement>("img").forEach((img) => img.style.setProperty("visibility", "hidden", "important"));
        },
      });
      paintImages(canvas);
      // Largura real do bloco em mm (1px ≈ 25.4/96 mm); nunca maior que a área útil.
      const elWidthMm = Math.min((el as HTMLElement).offsetWidth * 25.4 / 96, opts?.contentWidthMm ?? usableW);
      const pxPerMm = canvas.width / elWidthMm;
      const naturalHeight = canvas.height / pxPerMm;
      const cssToMm = elWidthMm / Math.max(1, el.getBoundingClientRect().width);
      const left = (pageW - elWidthMm) / 2;
      if (naturalHeight <= usableH) {
        putImage(canvas.toDataURL("image/jpeg", 0.94), elWidthMm, naturalHeight);
        (pdf as any).__contentBottomMm = margin + contentBottomPx(canvas) / pxPerMm;
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
      // Camada de texto invisível sobre a imagem: torna o PDF selecionável/pesquisável sem alterar o visual.
      const lastPage = pdf.getNumberOfPages();
      pdf.setFont("helvetica", "normal");
      for (const ln of textLines) {
        const text = toWinAnsi(ln.text);
        if (!text.trim()) continue;
        const yMm = ln.y * cssToMm;
        const pageOffset = naturalHeight <= usableH ? 0 : Math.floor(yMm / usableH);
        const page = firstPageIndex + 1 + pageOffset;
        if (page > lastPage) continue;
        pdf.setPage(page);
        const hMm = ln.h * cssToMm;
        const fontPt = Math.max(1, (hMm * 0.82) / 0.3528);
        pdf.setFontSize(fontPt);
        const natural = pdf.getTextWidth(text);
        const targetW = ln.w * cssToMm;
        const opts: Record<string, unknown> = { baseline: "top", renderingMode: "invisible" };
        if (natural > 0 && text.length > 1) opts.charSpace = (targetW - natural) / (text.length - 1);
        pdf.text(text, left + ln.x * cssToMm, margin + (yMm - pageOffset * usableH) + hMm * 0.1, opts);
      }
      pdf.setPage(lastPage);
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
