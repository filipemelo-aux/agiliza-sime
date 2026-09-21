// Fonte única de verdade: qual plano de contas cada tipo de combustível utiliza.
// Gasolina/Etanol => Frota de Apoio (2.1.6.01 Combustível Apoio)
// Diesel/Diesel S10 => Operacional (2.1.1.01 Diesel)
// Arla 32 => 2.1.1.02 Arla 32

export const FUEL_ACCOUNT_CODE: Record<string, string> = {
  gasolina: "2.1.6.01",
  etanol: "2.1.6.01",
  diesel: "2.1.1.01",
  diesel_s10: "2.1.1.01",
  arla32: "2.1.1.02",
};

export const DEFAULT_FUEL_ACCOUNT_CODE = "2.1.1.01";

export function fuelAccountCode(tipoCombustivel?: string | null): string {
  return FUEL_ACCOUNT_CODE[(tipoCombustivel || "").toLowerCase()] || DEFAULT_FUEL_ACCOUNT_CODE;
}
