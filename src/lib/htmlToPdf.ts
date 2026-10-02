import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Renderiza um HTML completo (A4) num iframe oculto e baixa como PDF. */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); }),
      ),
    );
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".doc-page"));
    const targets = pages.length ? pages : [doc.body];
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = 210, pageH = 297, margin = 6;
    const usableW = pageW - margin * 2, usableH = pageH - margin * 2;
    let first = true;
    for (const el of targets) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 794 });
      const pxPerMm = canvas.width / usableW;
      const slicePx = Math.floor(usableH * pxPerMm);
      for (let y = 0; y < canvas.height; y += slicePx) {
        const h = Math.min(slicePx, canvas.height - y);
        const part = document.createElement("canvas");
        part.width = canvas.width;
        part.height = h;
        part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, usableW, h / pxPerMm);
      }
    }
    pdf.save(filename);
  } finally {
    iframe.remove();
  }
}
