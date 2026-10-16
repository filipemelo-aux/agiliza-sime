// Abre um documento HTML leve em uma nova janela e aciona a impressão do navegador.
// O usuário pode salvar como PDF sem renderização pesada no aplicativo.
// NÃO usar para cheques (layout próprio em checkPdf.ts).
import { toast } from "@/lib/notice";
import { printBrandFooterHtml } from "@/lib/printBrand";
import { getCurrentTenantLogoUrl } from "@/lib/tenantLogo";
import { resolvePrintHeaders } from "@/lib/printHeader";

/** Marcador usado nos cabeçalhos: é trocado pela logo da empresa logada. */
export const TENANT_LOGO_MARKER = "__TENANT_LOGO__";

const MARGIN_MM = 12;

function sanitizeFileName(name: string) {
  return (name || "documento")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\-. ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 90) || "documento";
}

function detectLandscape(html: string) {
  return /@page[^{]*\{[^}]*landscape/i.test(html) || /size:\s*A4\s+landscape/i.test(html);
}

/** Abre uma JANELA separada (não aba) para a visualização de impressão. Chamar dentro do clique. */
export function openPrintWindow(): Window | null {
  const w = Math.min(1100, window.screen.availWidth - 40);
  const h = Math.max(600, window.screen.availHeight - 60);
  const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
  return window.open("", "_blank", `popup=yes,width=${w},height=${h},left=${left},top=20,resizable=yes,scrollbars=yes`);
}

export async function downloadHtmlAsPdf(html: string, fileName: string, opts?: { landscape?: boolean; win?: Window | null }) {
  const landscape = opts?.landscape ?? detectLandscape(html);
  const printWindow = opts?.win ?? openPrintWindow();
  if (!printWindow) {
    toast.error("Permita a abertura da janela de impressão no navegador.");
    return;
  }

  // Cabeçalho padrão (marcador) → logo + dados da agência.
  if (html.includes("<!--PRINT_HEADER:")) {
    try { html = await resolvePrintHeaders(html); } catch { /* mantém documento */ }
  }
  // Cabeçalho: logo da empresa logada (sem logo cadastrada, a imagem é omitida).
  if (html.includes(TENANT_LOGO_MARKER)) {
    let logo: string | null = null;
    try { logo = await getCurrentTenantLogoUrl(); } catch { /* sem logo */ }
    html = logo
      ? html.split(TENANT_LOGO_MARKER).join(logo)
      : html.replace(/<img[^>]*__TENANT_LOGO__[^>]*>/g, "");
  }
  // Rodapé padrão: Agiliza TMS by fsm ao final do documento.
  html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${printBrandFooterHtml()}</body>`);

  const safeTitle = sanitizeFileName(fileName).replace(/_/g, " ");
  // Remove comandos antigos e inclui um único controle leve para imprimir novamente.
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove barras/botões de impressão embutidos no documento (evita botão duplicado)
    .replace(/<button[^>]*window\.print\(\)[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(/<\/head>/i, `<style>
      @page{size:A4 ${landscape ? "landscape" : "portrait"};margin:${MARGIN_MM}mm!important}
      html,body{background:#fff!important}
      .print-window-actions{position:sticky;top:0;z-index:99999;display:flex;gap:8px;justify-content:flex-start;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #d1d5db}
      .print-window-actions button{display:inline-flex;align-items:center;gap:6px;font:600 12px Arial,sans-serif;padding:6px 10px;border:0;border-radius:4px;color:#fff;background:#2B4C7E;cursor:pointer}
      .print-window-actions button.btn-xls{background:#1e7e34}
      .print-window-actions .lbl{display:none}
      .print-window-actions button:hover .lbl{display:inline}
      @media print{.print-window-actions,.no-print,.toolbar{display:none!important}}
      @media screen{
        html{background:#e5e7eb!important;padding:0 0 24px}
        body{box-sizing:border-box!important;width:${landscape ? 297 : 210}mm!important;max-width:none!important;min-height:${landscape ? 210 : 297}mm;margin:20px auto!important;padding:0 ${MARGIN_MM}mm ${MARGIN_MM}mm!important;background:#fff!important;box-shadow:0 2px 12px rgba(0,0,0,.18)}
        .print-window-actions{margin:0 -${MARGIN_MM}mm ${MARGIN_MM}mm}
      }
    </style></head>`)
    .replace(/<body([^>]*)>/i, `<body$1><div class="print-window-actions">
      <button type="button" title="Imprimir / Salvar PDF" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        <span class="lbl">Imprimir / Salvar PDF</span>
      </button>
      <button type="button" class="btn-xls" id="btn-export-xls" title="Baixar tabela em Excel (.xls)" onclick="exportXls()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        <span class="lbl">Baixar Excel (.xls)</span>
      </button>
    </div>`)
    .replace(/<\/body>/i, `<script>
      (function(){
        var btn=document.getElementById('btn-export-xls');
        var tables=Array.prototype.slice.call(document.querySelectorAll('table'));
        var main=tables.sort(function(a,b){return b.querySelectorAll('tr').length-a.querySelectorAll('tr').length})[0];
        if(!main){if(btn)btn.parentNode.removeChild(btn);return;}
        window.exportXls=function(){
          var c=main.cloneNode(true);
          c.querySelectorAll('script,style,button,input,svg,img').forEach(function(n){n.remove()});
          var h='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Planilha</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>'+c.outerHTML+'</body></html>';
          var blob=new Blob(['\\ufeff'+h],{type:'application/vnd.ms-excel'});
          var a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download=(document.title||'planilha').replace(/[^\\w\\- ]+/g,'').trim().replace(/\\s+/g,'_')+'.xls';
          document.body.appendChild(a);a.click();a.remove();
          setTimeout(function(){URL.revokeObjectURL(a.href)},30000);
        };
      })();
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
  // Se houver linhas selecionadas, imprime apenas elas
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const isSel = (r: Element) =>
    r.getAttribute("aria-selected") === "true" || r.getAttribute("data-state") === "selected" ||
    !!r.querySelector('button[role="checkbox"][data-state="checked"], [role="checkbox"][aria-checked="true"]') ||
    Array.from(r.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).some((i) => i.checked);
  const selectedIdx = new Set(bodyRows.map((r, i) => (isSel(r) ? i : -1)).filter((i) => i >= 0));
  const clone = table.cloneNode(true) as HTMLTableElement;
  if (selectedIdx.size > 0) {
    Array.from(clone.querySelectorAll("tbody tr")).forEach((r, i) => { if (!selectedIdx.has(i)) r.remove(); });
    clone.querySelector("tfoot")?.remove();
  }
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
