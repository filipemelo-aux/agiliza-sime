/**
 * Splits a PDF file into individual single-page PDF blobs using pdf.js + jsPDF.
 * Each page is rendered to canvas and re-created as a standalone PDF.
 */
export async function splitPdfPages(file: File): Promise<Blob[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { jsPDF } = await import("jspdf");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdf.numPages;
  const blobs: Blob[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 2; // good quality
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Create a new PDF with the same aspect ratio
    const widthMm = (viewport.width / scale) * 0.264583; // px to mm at 96dpi
    const heightMm = (viewport.height / scale) * 0.264583;
    const orientation = widthMm > heightMm ? "l" : "p";

    const doc = new jsPDF({ orientation, unit: "mm", format: [widthMm, heightMm] });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    doc.addImage(imgData, "JPEG", 0, 0, widthMm, heightMm);

    const pdfBlob = doc.output("blob");
    blobs.push(pdfBlob);
  }

  return blobs;
}
