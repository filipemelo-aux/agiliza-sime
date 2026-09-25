// Abre um documento HTML leve em uma nova janela e aciona a impressão do navegador.
// O usuário pode salvar como PDF sem renderização pesada no aplicativo.
// NÃO usar para cheques (layout próprio em checkPdf.ts).
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
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast.error("Permita a abertura da janela de impressão no navegador.");
    return;
  }

  const safeTitle = sanitizeFileName(fileName).replace(/_/g, " ");
  // Remove comandos antigos e inclui um único controle leve para imprimir novamente.
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(/<\/head>/i, `<style>
      @page{size:A4 ${landscape ? "landscape" : "portrait"};margin:${MARGIN_MM}mm!important}
      html,body{background:#fff!important}
      .print-window-actions{position:sticky;top:0;z-index:99999;display:flex;justify-content:flex-end;padding:8px 12px;background:#fff;border-bottom:1px solid #d1d5db}
      .print-window-actions button{font:600 12px Arial,sans-serif;padding:7px 12px;border:0;border-radius:4px;color:#fff;background:#2B4C7E;cursor:pointer}
      @media print{.print-window-actions,.no-print,.toolbar{display:none!important}}
    </style></head>`)
    .replace(/<body([^>]*)>/i, `<body$1><div class="print-window-actions"><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button></div>`)
    .replace(/<\/body>/i, `<script>
      window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},200)},{once:true});
    </script></body>`);

  try {
    printWindow.document.open();
    printWindow.document.write(clean);
    printWindow.document.close();
  } catch (e: unknown) {
    printWindow.close();
    console.error(e);
    toast.error("Não foi possível abrir a impressão.");
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
