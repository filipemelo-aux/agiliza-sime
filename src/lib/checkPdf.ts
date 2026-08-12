import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { valorPorExtenso, quebrarExtenso } from "@/lib/valorExtenso";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export interface BuildCheckPdfParams {
  layout: Record<string, any>;
  valor: number;
  nominal: string;
  historico?: string | null;
  cidade: string;
  /** ISO yyyy-mm-dd */
  dataISO: string;
  cruzado: boolean;
  imprimirCanhoto: boolean;
  /** Cheque pré-datado: imprime "BOM PARA dd/mm/aaaa" */
  predatado?: boolean;
  /** ISO yyyy-mm-dd — data de vencimento do cheque pré-datado */
  dataVencimentoISO?: string | null;
}

/**
 * Gera o PDF do cheque em folha A4 retrato, usando as coordenadas (mm) do template.
 * Fonte única de verdade para emissão real e para a pré-visualização de teste do layout.
 */
export async function buildCheckPdf({
  layout,
  valor,
  nominal,
  historico,
  cidade,
  dataISO,
  cruzado,
  imprimirCanhoto,
  predatado,
  dataVencimentoISO,
}: BuildCheckPdfParams): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    putOnlyUsedFonts: true,
    compress: false,
  });
  (doc as any).setDisplayMode?.("fullwidth");
  (doc as any).viewerPreferences?.({
    PrintScaling: "None",
    PickTrayByPDFSize: true,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Âncora invisível: evita rotação/centralização automática dos drivers
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.01);
  doc.rect(0, 0, pageW, pageH);
  doc.setFont("courier", "normal");
  doc.setFontSize(10);

  const d = Number(dataISO.slice(8, 10));
  const m = Number(dataISO.slice(5, 7));
  const y = dataISO.slice(0, 4);

  const valorStr = formatCurrency(valor).replace("R$", "").trim();
  const extensoProtegido = `*** ${valorPorExtenso(valor)} ***`;

  const ext1X = Number(layout.valor_extenso1_x);
  const ext2X = Number(layout.valor_extenso2_x);

  const folhaW = Math.min(Number(layout.largura_folha_mm) || pageW, pageW);
  const larguraChar = doc.getTextWidth("0") || 1.9;
  const maxChars1 = Math.max(10, Math.floor((folhaW - ext1X) / larguraChar));
  const [linha1Base, linha2Base] = quebrarExtenso(extensoProtegido, maxChars1);
  const linha1 = linha1Base.padEnd(maxChars1, "*");
  const linha2 = linha2Base ? linha2Base.padEnd(maxChars1, "*") : "";

  doc.setFont("courier", "bold");
  doc.text(`## ${valorStr} ##`, Number(layout.valor_numerico_x), Number(layout.valor_numerico_y));
  doc.setFont("courier", "normal");
  doc.text(linha1, ext1X, Number(layout.valor_extenso1_y), { baseline: "alphabetic" });
  if (linha2) doc.text(linha2, ext2X, Number(layout.valor_extenso2_y), { baseline: "alphabetic" });
  doc.text(nominal || "", Number(layout.nominal_x), Number(layout.nominal_y));
  doc.text(cidade.trim(), Number(layout.cidade_x), Number(layout.cidade_y));
  doc.text(
    `${String(d).padStart(2, "0")} ${MESES[m - 1] || ""} ${y}`,
    Number(layout.data_x),
    Number(layout.data_y),
  );

  if (cruzado) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    const folhaH = Math.min(Number(layout.altura_folha_mm) || 90, pageH);
    const canhotoDireita = Number(layout.canhoto_valor_x) > folhaW / 2;
    const topo = 2;
    const base = Math.max(topo + 5, folhaH - 2);
    const desloc = base - topo; // inclinação 45°
    if (canhotoDireita) {
      doc.line(6, topo, 6 + desloc, base);
      doc.line(12, topo, 12 + desloc, base);
    } else {
      doc.line(folhaW - 6, topo, folhaW - 6 - desloc, base);
      doc.line(folhaW - 12, topo, folhaW - 12 - desloc, base);
    }
    doc.setDrawColor(255, 255, 255);
  }

  const bomPara = predatado && dataVencimentoISO ? `BOM PARA ${formatDateBR(dataVencimentoISO)}` : "";

  // "Bom para" no corpo do cheque (canto inferior direito, conforme layout)
  if (bomPara) {
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.text(bomPara, Number(layout.bom_para_x), Number(layout.bom_para_y), { baseline: "alphabetic" });
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
  }

  if (imprimirCanhoto) {
    doc.setFontSize(8);
    doc.text(valorStr, Number(layout.canhoto_valor_x), Number(layout.canhoto_valor_y), { baseline: "alphabetic" });
    doc.text(formatDateBR(dataISO), Number(layout.canhoto_data_x), Number(layout.canhoto_data_y), { baseline: "alphabetic" });
    doc.text((nominal || "").slice(0, 15), Number(layout.canhoto_favorecido_x), Number(layout.canhoto_favorecido_y), { baseline: "alphabetic" });
    doc.text(historico || "", Number(layout.canhoto_referente_x), Number(layout.canhoto_referente_y), { baseline: "alphabetic" });
    if (bomPara) {
      doc.text(bomPara, Number(layout.canhoto_bom_para_x), Number(layout.canhoto_bom_para_y), { baseline: "alphabetic" });
    }
    doc.setFontSize(10);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Baixa (ou abre em nova aba, quando dentro de iframe) um PDF já gerado. */
export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
