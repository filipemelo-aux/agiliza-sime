/** Resolve only the selected configured reason; never accept an account from the driver request. */
export function portalReasonAccount(mapping: unknown, reason: string): string | null {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  const id = Object.prototype.hasOwnProperty.call(mapping, reason)
    ? (mapping as Record<string, unknown>)[reason] : null;
  return typeof id === "string" && id.trim() ? id : null;
}