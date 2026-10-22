import { describe, it, expect } from "vitest";
import { assignmentValidation, isImplement, unitCategory } from "./vehicleUnits";

describe("Placas independentes e composição", () => {
  it("distingue cavalo legado de carreta independente", () => {
    expect(unitCategory({ vehicle_type: "rodotrem" })).toBe("cavalo");
    expect(isImplement({ vehicle_type: "carreta", unit_category: "semirreboque" })).toBe(true);
    expect(isImplement({ vehicle_type: "carreta", unit_category: "cavalo" })).toBe(false);
  });
  it("aceita cavalo com duas carretas e dolly", () => {
    expect(assignmentValidation("cavalo", ["carreta1", "dolly", "carreta2"])).toBeNull();
  });
  it("aceita caminhão e utilitário sem implementos", () => {
    expect(assignmentValidation("rigido", [])).toBeNull();
    expect(assignmentValidation("utilitario", [])).toBeNull();
  });
  it("bloqueia placa repetida", () => {
    expect(assignmentValidation("cavalo", ["a", "a"])).toBe("Não repita placas na composição.");
  });
  it("limita composição a três implementos", () => {
    expect(assignmentValidation("cavalo", ["a", "b", "c", "d"])).toBe("Permitidos até três implementos por conjunto.");
  });
  it("impede implemento como unidade tratora", () => {
    expect(assignmentValidation("dolly", [])).toBe("Selecione uma unidade de tração.");
  });
  it("impede compor veículo leve com carreta", () => {
    expect(assignmentValidation("passeio", ["a"])).toBe("Veículos leves não recebem implementos.");
  });
});