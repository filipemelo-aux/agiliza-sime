/**
 * Extrai nome e documento do favorecido/pagador a partir da descrição do extrato.
 * Bancos como o Sicoob não preenchem payer/receiver na API de Open Finance,
 * mas embutem os dados na descrição no formato:
 *   "PIX RECEBIDO - OUTRA IF - Recebimento Pix|@NOME|@00.000.000 0001-00|@mensagem"
 */
export interface CounterpartyInfo {
  nome?: string;
  documento?: string;
  /** "favorecido" quando a descrição traz FAV., "remetente" quando traz REM. */
  papel?: "favorecido" | "remetente";
}

const DOC_RE = /^[\d*.\-/\s]+$/;

function isDocument(part: string) {
  const digits = part.replace(/\D/g, "");
  return DOC_RE.test(part) && (part.includes("*") || digits.length >= 11);
}

/** Captura "FAV.: NOME" / "REM: NOME" (Sicoob e afins). */
const MARKER_RE = /\b(FAV|BENEF(?:ICIARIO)?|REM|REMET(?:ENTE)?|PAG(?:ADOR)?)\b\.?\s*[:\-]\s*([^|]+)/i;

function markerRole(tag: string): "favorecido" | "remetente" {
  return /^(REM|PAG)/i.test(tag) ? "remetente" : "favorecido";
}

function fromMarker(description: string): CounterpartyInfo {
  const m = description.match(MARKER_RE);
  if (!m) return {};
  let rest = m[2].trim();
  const info: CounterpartyInfo = { papel: markerRole(m[1]) };
  // documento pode vir após o nome (ex.: "FAV.: FULANO - 000.000.000-00")
  const docMatch = rest.match(/([\d*][\d*.\-/\s]{9,})$/);
  if (docMatch && isDocument(docMatch[1].trim())) {
    info.documento = docMatch[1].trim();
    rest = rest.slice(0, docMatch.index).replace(/[\s\-–]+$/, "").trim();
  }
  if (rest && /[a-zA-ZÀ-ÿ]{3}/.test(rest)) info.nome = rest;
  return info;
}

export function counterpartyFromDescription(description?: string | null): CounterpartyInfo {
  if (!description) return {};

  const marker = fromMarker(description);

  const parts = description
    .split("|@")
    .slice(1)
    .map((p) => p.trim())
    .filter(Boolean);

  const info: CounterpartyInfo = { ...marker };
  for (const part of parts) {
    if (isDocument(part)) {
      if (!info.documento) info.documento = part;
    } else if (!info.nome && /[a-zA-ZÀ-ÿ]{3}/.test(part)) {
      info.nome = part;
    }
    if (info.nome && info.documento) break;
  }
  return info;
}


/** Descrição sem os blocos "|@" (mais legível na listagem). */
export function cleanBankDescription(description?: string | null): string {
  if (!description) return "";
  return description.split("|@")[0].replace(/[-\s]+$/, "").trim();
}
