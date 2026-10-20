import { describe, expect, it, vi } from "vitest";
import { preparePdfImages, snapshotPdfImages } from "./pdfImages";

function image(doc: Document, valid = true) {
  const img = doc.createElement("img");
  img.src = "data:image/png;base64,example";
  Object.defineProperties(img, {
    decode: { value: vi.fn().mockResolvedValue(undefined) },
    naturalWidth: { value: valid ? 200 : 0 },
    naturalHeight: { value: valid ? 100 : 0 },
  });
  doc.body.append(img);
  return img;
}

describe("required PDF images", () => {
  it("rejects an already embedded but invalid image", async () => {
    const doc = document.implementation.createHTMLDocument();
    image(doc, false);
    await expect(preparePdfImages(doc)).rejects.toThrow("logomarca não carregou");
  });
  it("propagates decoding failures rather than generating a PDF without images", async () => {
    const doc = document.implementation.createHTMLDocument();
    const img = image(doc);
    vi.mocked(img.decode).mockRejectedValue(new Error("decode failed"));
    await expect(preparePdfImages(doc)).rejects.toThrow("decode failed");
  });
  it("paints the decoded image directly at its document position", () => {
    document.body.replaceChildren();
    const img = image(document);
    img.style.cssText = "display:block;object-fit:contain;opacity:1;border:0;padding:0";
    vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 400, height: 600 } as DOMRect);
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({ left: 40, top: 70, width: 100, height: 50 } as DOMRect);
    const ctx = { save: vi.fn(), restore: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), globalAlpha: 1 };
    const canvas = { width: 800, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const paint = snapshotPdfImages(document.body);
    paint(canvas);
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 30, 50, 100, 50);
  });
});