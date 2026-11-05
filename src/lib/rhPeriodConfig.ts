export interface RHPeriodConfig { firstEndDay: number; firstPayDay: number; secondPayDay: number }
export const DEFAULT_RH_PERIOD_CONFIG: RHPeriodConfig = { firstEndDay: 15, firstPayDay: 20, secondPayDay: 5 };
export function validateRHPeriodConfig(c: RHPeriodConfig): string | null {
  if (!Number.isInteger(c.firstEndDay) || c.firstEndDay < 1 || c.firstEndDay > 27) return "Fim da primeira quinzena deve estar entre 1 e 27.";
  if (!Number.isInteger(c.firstPayDay) || c.firstPayDay <= c.firstEndDay || c.firstPayDay > 28) return "Prazo da primeira quinzena deve ser após seu fim e até dia 28.";
  if (!Number.isInteger(c.secondPayDay) || c.secondPayDay < 1 || c.secondPayDay > 28) return "Prazo da segunda quinzena deve estar entre 1 e 28.";
  return null;
}