export const DEFAULT_PORTAL_REASONS = ["Alimentação", "Pedágio", "Borracharia", "Hospedagem", "Lavagem", "Peças", "Outros"];

export function validatePortalReasons(reasons: string[]): string[] {
  const normalized = reasons.map((reason) => reason.trim());
  if (!normalized.length) throw new Error("Informe ao menos um motivo.");
  if (normalized.length > 100) throw new Error("O máximo é 100 motivos.");
  if (normalized.some((reason) => !reason || reason.length > 80)) throw new Error("Preencha os motivos com até 80 caracteres.");
  if (new Set(normalized.map((reason) => reason.toLocaleLowerCase("pt-BR"))).size !== normalized.length) throw new Error("Há motivos repetidos.");
  return normalized;
}