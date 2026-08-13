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
    precision: 16,
    floatPrecision: 16,
  } as any);
  // Zoom 100% (tamanho real) ao abrir e impressão sem redimensionamento
  (doc as any).setDisplayMode?.(100, "UseNone");
  (doc as any).viewerPreferences?.({
    PrintScaling: "None",
    PickTrayByPDFSize: true,
    NumCopies: 1,
    Duplex: "Simplex",
    FitWindow: false,
    CenterWindow: false,
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

  const valorStr = formatCurrency(valor).replace("R$", "").trim().toUpperCase();
  const extensoProtegido = `*** ${valorPorExtenso(valor)} ***`.toUpperCase();

  const ext1X = Number(layout.valor_extenso1_x);
  const ext2X = Number(layout.valor_extenso2_x);

  const folhaW = Math.min(Number(layout.largura_folha_mm) || pageW, pageW);
  const larguraChar = doc.getTextWidth("0") || 1.9;
  const maxChars1 = Math.max(10, Math.floor((folhaW - ext1X) / larguraChar));
  const [linha1Base, linha2Base] = quebrarExtenso(extensoProtegido, maxChars1);
  const linha1 = linha1Base.padEnd(maxChars1, "*").toUpperCase();
  const linha2 = linha2Base ? linha2Base.padEnd(maxChars1, "*").toUpperCase() : "";

  doc.setFont("courier", "bold");
  doc.text(`#${valorStr}#`, Number(layout.valor_numerico_x), Number(layout.valor_numerico_y));
  doc.setFont("courier", "normal");
  doc.text(linha1, ext1X, Number(layout.valor_extenso1_y), { baseline: "alphabetic" });
  if (linha2) doc.text(linha2, ext2X, Number(layout.valor_extenso2_y), { baseline: "alphabetic" });
  doc.text((nominal || "").toUpperCase(), Number(layout.nominal_x), Number(layout.nominal_y));
  doc.text(cidade.trim().toUpperCase(), Number(layout.cidade_x), Number(layout.cidade_y));
  const diaTxt = String(d).padStart(2, "0");
  const mesTxt = (MESES[m - 1] || "").toUpperCase();
  const anoTxt = String(y);
  const diaX = Number(layout.data_dia_x) || 0;
  const mesX = Number(layout.data_mes_x) || 0;
  const anoX = Number(layout.data_ano_x) || 0;
  if (diaX || mesX || anoX) {
    // Posicionamento individual de dia, mês e ano
    const dataY = Number(layout.data_y) || 0;
    if (diaX) doc.text(diaTxt, diaX, Number(layout.data_dia_y) || dataY);
    if (mesX) doc.text(mesTxt, mesX, Number(layout.data_mes_y) || dataY);
    if (anoX) doc.text(anoTxt, anoX, Number(layout.data_ano_y) || dataY);
  } else {
    doc.text(`${diaTxt} ${mesTxt} ${anoTxt}`, Number(layout.data_x), Number(layout.data_y));
  }

  if (cruzado) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    const x0 = Number(layout.cruzamento_x) || 6;
    const y0 = Number(layout.cruzamento_y) || 2;
    const altura = Number(layout.cruzamento_altura_mm) || 30;
    const espaco = Number(layout.cruzamento_espaco_mm) || 6;
    // Diagonais no sentido contrário: iniciam na direita e terminam na esquerda
    doc.line(x0 + altura, y0, x0, y0 + altura);
    doc.line(x0 + espaco + altura, y0, x0 + espaco, y0 + altura);
    doc.setDrawColor(255, 255, 255);
  }

  const bomPara = predatado && dataVencimentoISO ? `BOM PARA ${formatDateBR(dataVencimentoISO)}`.toUpperCase() : "";
  const bomParaCanhoto = predatado && dataVencimentoISO ? `BOM P ${formatDateBR(dataVencimentoISO)}`.toUpperCase() : "";

  // "Bom para" no corpo do cheque (canto inferior direito, conforme layout)
  if (bomPara) {
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.text(bomPara, Number(layout.bom_para_x), Number(layout.bom_para_y), { baseline: "alphabetic" });
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
  }

  if (imprimirCanhoto) {
    // Valor do canhoto: mesmo tamanho e negrito do valor numérico do talão
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.text(valorStr.slice(0, 17), Number(layout.canhoto_valor_x), Number(layout.canhoto_valor_y), { baseline: "alphabetic", align: "left" });

    // Demais campos do canhoto voltam ao tamanho padrão
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.text(formatDateBR(dataISO).toUpperCase().slice(0, 17), Number(layout.canhoto_data_x), Number(layout.canhoto_data_y), { baseline: "alphabetic", align: "left" });
    const nominalUp = (nominal || "").toUpperCase();
    doc.text(nominalUp.slice(0, 17), Number(layout.canhoto_favorecido_x), Number(layout.canhoto_favorecido_y), { baseline: "alphabetic", align: "left" });
    const nominalLinha2 = nominalUp.slice(17, 34).trim();
    if (nominalLinha2) {
      const y2 = Number(layout.canhoto_favorecido2_y) || Number(layout.canhoto_favorecido_y) + 4;
      doc.text(nominalLinha2.slice(0, 17), Number(layout.canhoto_favorecido2_x) || Number(layout.canhoto_favorecido_x), y2, { baseline: "alphabetic", align: "left" });
    }
    doc.text((historico || "").toUpperCase().slice(0, 17), Number(layout.canhoto_referente_x), Number(layout.canhoto_referente_y), { baseline: "alphabetic", align: "left" });
    if (bomParaCanhoto) {
      doc.setFont("courier", "bold");
      doc.text(bomParaCanhoto.slice(0, 17), Number(layout.canhoto_bom_para_x), Number(layout.canhoto_bom_para_y), { baseline: "alphabetic", align: "left" });
      doc.setFont("courier", "normal");
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

/**
 * Envia o PDF direto para a impressora, em escala real (100%) e alta qualidade,
 * usando um iframe oculto para acionar o diálogo de impressão do navegador.
 */
export function printPdfBytes(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 120000);
}
