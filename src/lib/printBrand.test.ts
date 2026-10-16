import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { drawPrintBrandFooter } from "./printBrand";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const img = { data: PNG, w: 200, h: 40 };

function contentOf(pdf: jsPDF) {
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("drawPrintBrandFooter", () => {
  it("does not draw the word 'by' when only the Agiliza logo is present", () => {
    const pdf = new jsPDF({ compress: false });
    drawPrintBrandFooter(pdf, 800, img, null);
    expect(contentOf(pdf)).not.toContain("(by) Tj");
  });

  it("draws the word 'by' between the two logos", () => {
    const pdf = new jsPDF({ compress: false });
    drawPrintBrandFooter(pdf, 800, img, img);
    expect(contentOf(pdf)).toContain("(by) Tj");
  });
});
