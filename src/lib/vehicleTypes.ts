/**
 * Tipos de veículo da frota que pertencem ao transporte de carga pesado.
 * Servem de fonte única para decidir o que só se aplica a caminhão
 * (ex.: arla 32, que veículos leves não usam).
 */
export const TRUCK_TYPES = new Set([
  "truck",
  "bitruck",
  "carreta",
  "carreta_ls",
  "rodotrem",
  "bitrem",
  "treminhao",
]);

/** Verdadeiro quando o tipo informado é de caminhão / combinação de carga. */
export function isTruckVehicle(vehicleType?: string | null) {
  return TRUCK_TYPES.has(String(vehicleType || "").trim());
}
