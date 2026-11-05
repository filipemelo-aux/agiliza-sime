import { describe, it, expect } from "vitest";
import { parcelasVale } from "./valeParcelas";
describe("Parcelas quinzenais do vale", () => {
  it("desconta a primeira no acerto atual e disponibiliza as demais nas quinzenas seguintes", () => {
    const parcelas = parcelasVale(100, 3, { month: "2026-10", inicio: "2026-10-16", fim: "2026-10-31" });
    expect(parcelas.map((p) => p.periodo.inicio)).toEqual(["2026-10-16", "2026-11-01", "2026-11-16"]);
    expect(parcelas.map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(10000);
  });
  it("atravessa dezembro e fevereiro sem intervalos de quinze dias fixos", () => {
    const p = parcelasVale(500, 6, { month: "2026-12", inicio: "2026-12-16", fim: "2026-12-31" });
    expect(p.map((p) => p.periodo.inicio)).toEqual(["2026-12-16", "2027-01-01", "2027-01-16", "2027-02-01", "2027-02-16", "2027-03-01"]);
  });
});