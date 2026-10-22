export const UNIT_CATEGORIES = [
  { value: "cavalo", label: "Cavalo Mecânico (Trator)" },
  { value: "rigido", label: "Caminhão Rígido (Chassi)" },
  { value: "semirreboque", label: "Semirreboque / Carreta" },
  { value: "dolly", label: "Dolly" },
  { value: "reboque", label: "Reboque" },
  { value: "utilitario", label: "Utilitário / Leve" },
  { value: "passeio", label: "Passeio" },
] as const;

export function unitCategory(v: { unit_category?: string | null; vehicle_type?: string | null }): string {
  if (v.unit_category) return v.unit_category;
  if (["carreta", "carreta_ls", "rodotrem", "bitrem"].includes(v.vehicle_type || "")) return "cavalo";
  if (["truck", "bitruck", "treminhao"].includes(v.vehicle_type || "")) return "rigido";
  return v.vehicle_type || "rigido";
}

export function isImplement(v: { unit_category?: string | null; vehicle_type?: string | null }) {
  return ["semirreboque", "dolly", "reboque"].includes(unitCategory(v));
}

export function unitLabel(v: { unit_category?: string | null; vehicle_type?: string | null }) {
  return UNIT_CATEGORIES.find(c => c.value === unitCategory(v))?.label || "—";
}

export function assignmentValidation(category: string, implements: string[]) {
  if (implements.length > 3) return "Permitidos até três implementos por conjunto.";
  if (new Set(implements).size !== implements.length) return "Não repita placas na composição.";
  if (["semirreboque", "dolly", "reboque"].includes(category)) return "Selecione uma unidade de tração.";
  if (["utilitario", "passeio"].includes(category) && implements.length) return "Veículos leves não recebem implementos.";
  return null;
}