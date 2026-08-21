/**
 * Extrai nome e documento do favorecido/pagador a partir da descrição do extrato.
 * Bancos como o Sicoob não preenchem payer/receiver na API de Open Finance,
 * mas embutem os dados na descrição no formato:
 *   "PIX RECEBIDO - OUTRA IF - Recebimento Pix|@NOME|@00.000.000 0001-00|@mensagem"
 */
export interface CounterpartyInfo {
  nome?: string;
  documento?: string;
}

const DOC_RE = /^[\d*.\-/\s]+$/;

function isDocument(part: string) {
  const digits = part.replace(/\D/g, "");
  return DOC_RE.test(part) && (part.includes("*") || digits.length >= 11);
}

export function counterpartyFromDescription(description?: string | null): CounterpartyInfo {
  if (!description) return {};
  const parts = description
    .split("|@")
    .slice(1)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};

  const info: CounterpartyInfo = {};
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
