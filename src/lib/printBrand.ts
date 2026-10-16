import type { jsPDF } from "jspdf";
import agilizaLogo from "@/assets/brand/agiliza-tms-logo.png";
import fsmLogo from "@/assets/brand/fsm-systems-logo-horizontal.png";

export const printBrandAssets = { agiliza: agilizaLogo, fsm: fsmLogo };
const BRAND = { agilizaHeightPt: 18, fsmHeightPt: 13.5, gapPt: 6 };
type BrandImage = { data: string; w: number; h: number } | null;

export function printBrandFooterHtml() {
  const absolute = (url: string) => new URL(url, window.location.origin).href;
  return `<div class="agiliza-brand-footer" style="display:flex;justify-content:center;align-items:center;gap:${BRAND.gapPt}pt;margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;break-inside:avoid">
    <img src="${absolute(agilizaLogo)}" alt="Agiliza TMS" style="display:block;height:${BRAND.agilizaHeightPt}pt;width:auto;max-width:none" />
    <span style="font:9pt Arial,sans-serif;color:#555">by</span>
    <img src="${absolute(fsmLogo)}" alt="fsm | sistemas" style="display:block;height:${BRAND.fsmHeightPt}pt;width:auto;max-width:none" />
  </div>`;
}

/** Shared physical size in points; only the reserved fiscal footer is changed. */
export function drawPrintBrandFooter(pdf: jsPDF, top: number, agiliza: BrandImage, fsm: BrandImage) {
  const ah = BRAND.agilizaHeightPt, fh = BRAND.fsmHeightPt, gap = BRAND.gapPt;
  const aw = agiliza ? agiliza.w / agiliza.h * ah : 0;
  const fw = fsm ? fsm.w / fsm.h * fh : 0;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(85);
  // O "by" só aparece quando as duas marcas estão no rodapé.
  const both = Boolean(agiliza && fsm);
  const by = both ? pdf.getTextWidth("by") : 0;
  let x = (pdf.internal.pageSize.getWidth() - aw - fw - by - gap * (both ? 2 : 0)) / 2;
  if (agiliza) pdf.addImage(agiliza.data, "PNG", x, top, aw, ah);
  if (both) {
    x += aw + gap;
    pdf.text("by", x, top + ah / 2 + 3);
    x += by + gap;
  }
  if (fsm) pdf.addImage(fsm.data, "PNG", x, top + (ah - fh) / 2, fw, fh);
  pdf.setTextColor(0);
}