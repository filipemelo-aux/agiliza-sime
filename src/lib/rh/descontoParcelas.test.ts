import { describe, expect, it } from "vitest";
import { parcelasDesconto } from "./descontoParcelas";
const periodo = { inicio: "2026-10-16", fim: "2026-10-31", month: "2026-10" };
describe("Parcelas de outros descontos", () => {
  it("crédito usa o valor da parcela e dez quinzenas consecutivas", () => {
    const rows = parcelasDesconto({ tipo: "credito_trabalhador", valor: 250, parcelas: 10 }, periodo, false);
    expect(rows).toHaveLength(10);
    expect(rows.map((p) => p.valor)).toEqual(Array(10).fill(250));
    expect(rows[0].periodo.inicio).toBe("2026-10-16");
    expect(rows[1].periodo.inicio).toBe("2026-11-01");
    expect(rows[2].periodo.inicio).toBe("2026-11-16");
    expect(rows[9].periodo.inicio).toBe("2027-03-01");
  });
  it("outros divide o total e preserva os centavos", () => {
    const rows = parcelasDesconto({ tipo: "avaria", valor: 100, parcelas: 3 }, periodo, false);
    expect(rows.map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(rows.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(10000);
  });
  it("administrativo disponibiliza as parcelas nos meses seguintes", () => {
    const rows = parcelasDesconto({ tipo: "credito_trabalhador", valor: 250, parcelas: 3 }, { inicio: "2026-10-01", fim: "2026-10-31", month: "2026-10" }, true);
    expect(rows.map((p) => p.periodo.inicio)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(rows.map((p) => p.valor)).toEqual([250, 250, 250]);
  });
  it("respeita a configuração de limite da quinzena", () => {
    const rows = parcelasDesconto({ tipo: "multas", valor: 100, parcelas: 2 }, { inicio: "2026-10-01", fim: "2026-10-12", month: "2026-10" }, false, { firstEndDay: 12, firstPayDay: 20, secondPayDay: 5 });
    expect(rows[1].periodo.inicio).toBe("2026-10-13");
  });
  it("impede parcelas sem valor", () => {
    expect(() => parcelasDesconto({ tipo: "outros", valor: 0.01, parcelas: 2 }, periodo, false)).toThrow();
    expect(() => parcelasDesconto({ tipo: "outros", valor: 0, parcelas: 1 }, periodo, false)).toThrow();
  });
});