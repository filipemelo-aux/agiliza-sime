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
  const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
  try {
    // srcdoc antes de anexar: evita que o load do about:blank resolva cedo demais
    const loaded = new Promise<void>((resolve) => { iframe.onload = () => resolve(); });
    iframe.srcdoc = clean;
    document.body.appendChild(iframe);
    await withTimeout(loaded, 10000, "tempo esgotado ao montar o documento");
    const doc = iframe.contentDocument!;
    // imagens que não carregam não podem travar a geração
    await withTimeout(
      Promise.all(Array.from(doc.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
      5000, "imagens",
    ).catch(() => null);
    await new Promise((r) => setTimeout(r, 150));
    const body = doc.body;
    const fullH = body.scrollHeight + 20;
    iframe.style.height = `${fullH}px`;
    // limita o tamanho do canvas (navegadores falham acima de ~16000px)
    const scale = Math.max(0.8, Math.min(2, 15000 / fullH));
    const canvas = await withTimeout(
      html2canvas(body, { scale, backgroundColor: "#ffffff", useCORS: true, windowWidth: widthPx, width: widthPx, logging: false }),
      45000, "tempo esgotado ao gerar o PDF (documento muito grande)",
    );

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

/** Impressão rápida: gera PDF da tabela visível na área (a partir de um elemento de referência). */
export function quickPrintVisibleTable(anchor: HTMLElement | null, title: string) {
  let el: HTMLElement | null = anchor;
  let table: HTMLTableElement | null = null;
  while (el && !table) { table = el.querySelector("table"); el = el.parentElement; }
  if (!table) {
    // Área sem <table> (ex.: grades em divs): imprime o conteúdo com os estilos da página
    if (!anchor) { toast.warning("Nada para imprimir nesta tela"); return; }
    const area = anchor.cloneNode(true) as HTMLElement;
    area.querySelectorAll("button, input, select, [role='combobox']").forEach((n) => n.remove());
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.outerHTML).join("");
    const html2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${styles}<style>*{overflow:visible!important;max-height:none!important}</style></head><body><h1 style="font:bold 15px Arial;color:#2B4C7E;margin:0 0 2px">SIME TRANSPORTES — ${title}</h1><div style="font:9px Arial;color:#666;margin-bottom:8px">Gerado em ${new Date().toLocaleString("pt-BR")}</div>${area.outerHTML}</body></html>`;
    void downloadHtmlAsPdf(html2, `${title} ${new Date().toISOString().slice(0, 10)}`, { landscape: true });
    return;
  }
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.querySelectorAll('input[type="checkbox"], button[role="checkbox"], svg').forEach((n) => n.remove());
  clone.querySelectorAll<HTMLElement>("*").forEach((n) => { n.removeAttribute("style"); n.removeAttribute("class"); });
  const now = new Date().toLocaleString("pt-BR");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10px}
    h1{font-size:15px;margin:0 0 2px;color:#2B4C7E} .sub{color:#666;font-size:9px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse} th{background:#2B4C7E;color:#fff;text-align:left;padding:5px 4px 7px;font-size:9px;line-height:1.4}
    td{padding:3px 4px 5px;line-height:1.4;border-bottom:1px solid #ddd;font-size:9px;vertical-align:top} tr:nth-child(even) td{background:#f6f7f9}
  </style></head><body><h1>SIME TRANSPORTES — ${title}</h1><div class="sub">Gerado em ${now}</div>${clone.outerHTML}</body></html>`;
  const cols = clone.querySelectorAll("thead th").length;
  void downloadHtmlAsPdf(html, `${title} ${new Date().toISOString().slice(0, 10)}`, { landscape: cols > 7 });
}
