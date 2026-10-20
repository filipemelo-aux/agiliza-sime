// ============= Full file contents =============
// Marca do rodapé de impressão: somente a logo Agiliza TMS (sem "by fsm sistemas").

import type { jsPDF } from "jspdf";
import agilizaLogo from "@/assets/brand/agiliza-tms-logo.png";

export const printBrandAssets = { agiliza: agilizaLogo };
const BRAND = { agilizaHeightPt: 18 };
type BrandImage = { data: string; w: number; h: number } | null;

export function printBrandFooterHtml() {
  const absolute = (url: string) => new URL(url, window.location.origin).href;
  return `<div class="agiliza-brand-footer" style="display:flex;justify-content:center;align-items:center;margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;break-inside:avoid">
    <img src="${absolute(agilizaLogo)}" alt="Agiliza TMS" style="display:block;height:${BRAND.agilizaHeightPt}pt;width:auto;max-width:none" />
  </div>`;
}

/** Shared physical size in points. */
export function drawPrintBrandFooter(pdf: jsPDF, top: number, agiliza: BrandImage) {
  const ah = BRAND.agilizaHeightPt;
  const aw = agiliza ? agiliza.w / agiliza.h * ah : 0;
  const x = (pdf.internal.pageSize.getWidth() - aw) / 2;
  if (agiliza) pdf.addImage(agiliza.data, "PNG", x, top, aw, ah);
}
