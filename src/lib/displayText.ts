/**
 * Texto de exibição em tabelas. Não corta por número de letras: o corte com "…"
 * é feito pelo CSS (classe `truncate`) só quando o texto não cabe na coluna,
 * e o nome completo aparece no hover (atributo title).
 */
export function limitDisplayText(value: string | null | undefined, _maxLength?: number) {
  return String(value || "").trim();
}
