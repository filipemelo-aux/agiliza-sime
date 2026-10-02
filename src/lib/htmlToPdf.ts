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
      const naturalHeight = usableW * canvas.height / canvas.width;
      const renderHeight = Math.min(naturalHeight, usableH);
      const renderWidth = renderHeight === naturalHeight ? usableW : usableH * canvas.width / canvas.height;
      const x = (pageW - renderWidth) / 2;
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", x, margin, renderWidth, renderHeight);
    }
    pdf.save(filename);
  } finally {
    iframe.remove();
  }
}
