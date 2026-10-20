import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { drawPrintBrandFooter, printBrandFooterHtml } from "./printBrand";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const img = { data: PNG, w: 200, h: 40 };

function contentOf(pdf: jsPDF) {
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("printBrand", () => {
  it("footer HTML shows only the Agiliza logo, without 'by' or the fsm logo", () => {
    const html = printBrandFooterHtml();
    expect(html).toContain("Agiliza TMS");
    expect(html).not.toContain("fsm-systems-logo");
    expect(html).not.toMatch(/>\s*by\s*</);
  });

  it("draws only the Agiliza logo, without the word 'by'", () => {
    const pdf = new jsPDF({ compress: false });
    drawPrintBrandFooter(pdf, 800, img);
    expect(contentOf(pdf)).toContain("PNG");
    expect(contentOf(pdf)).not.toContain("(by) Tj");
  });
});
