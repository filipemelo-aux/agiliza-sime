import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Renderiza um HTML completo (A4) num iframe oculto e devolve o jsPDF (uma página por .doc-page). */
export async function buildHtmlPdf(html: string): Promise<jsPDF> {
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
    return pdf;
  } finally {
    iframe.remove();
  }
}

/** Renderiza um HTML completo (A4) num iframe oculto e baixa como PDF. */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const pdf = await buildHtmlPdf(html);
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
