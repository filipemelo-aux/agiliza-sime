/** Required images are decoded before capture; failures must not produce an incomplete PDF. */
export async function preparePdfImages(doc: Document): Promise<void> {
  await Promise.all(Array.from(doc.images).map(async (img) => {
    const src = img.currentSrc || img.src;
    if (!src) throw new Error("Imagem do documento sem endereço.");
    img.removeAttribute("srcset");
    img.removeAttribute("loading");
    if (!src.startsWith("data:")) {
      let blob: Blob | undefined;
      for (let attempt = 0; attempt < 3 && !blob; attempt++) {
        try {
          const response = await fetch(src, { cache: attempt ? "reload" : "default", mode: "cors", signal: AbortSignal.timeout(10000) });
          if (response.ok) {
            const candidate = await response.blob();
            if (candidate.size > 0) blob = candidate;
          }
        } catch { /* bounded retry */ }
      }
      if (!blob) throw new Error("Não foi possível carregar a logomarca do documento. Tente baixar novamente.");
      img.src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imagem inválida."));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(blob);
      });
    } else {
      img.src = src;
    }
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("A logomarca não carregou. Tente baixar novamente.");
  }));
}

/** Paint images directly, bypassing nested SVG image loading in foreignObject capture. */
export function snapshotPdfImages(target: HTMLElement): (canvas: HTMLCanvasElement) => void {
  const bounds = target.getBoundingClientRect();
  const view = target.ownerDocument.defaultView;
  if (!view) throw new Error("Janela do documento indisponível.");
  const placements: { img: HTMLImageElement; x: number; y: number; w: number; h: number; opacity: number }[] = [];
  for (const img of Array.from(target.querySelectorAll("img"))) {
    const style = view.getComputedStyle(img);
    const rect = img.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || !rect.width || !rect.height) continue;
    const leftInset = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const topInset = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    const width = rect.width - leftInset - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    const height = rect.height - topInset - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
    let w = width, h = height;
    if (style.objectFit === "contain" || style.objectFit === "scale-down") {
      const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight, style.objectFit === "scale-down" ? 1 : Infinity);
      w = img.naturalWidth * ratio;
      h = img.naturalHeight * ratio;
    }
    placements.push({ img, x: rect.left - bounds.left + leftInset + (width - w) / 2, y: rect.top - bounds.top + topInset + (height - h) / 2, w, h, opacity: Number(style.opacity) });
  }
  return (canvas) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível desenhar as imagens do PDF.");
    ctx.save();
    ctx.resetTransform();
    ctx.scale(canvas.width / bounds.width, canvas.width / bounds.width);
    for (const { img, x, y, w, h, opacity } of placements) {
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  };
}