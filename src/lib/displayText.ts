export function limitDisplayText(value: string | null | undefined, maxLength = 50) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}