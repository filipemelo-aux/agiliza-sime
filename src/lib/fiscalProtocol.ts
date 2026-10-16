/** Extract only the protocol number, never the full authorization response. */
export function fiscalProtocolNumber(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    for (const key of ["numero_protocolo", "protocolo", "nProt", "protocol", "infProt", "protCTe", "cteProc"]) {
      const number = fiscalProtocolNumber(data[key]);
      if (number) return number;
    }
    return "";
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (/^\d+$/.test(text)) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== text) return fiscalProtocolNumber(parsed);
  } catch { /* XML is also supported. */ }
  return text.match(/<(?:\w+:)?nProt\b[^>]*>\s*(\d+)\s*<\//i)?.[1] || "";
}