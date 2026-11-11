import { describe, expect, it } from "vitest";
import { dataOriginalDesconto } from "@/lib/rh/descontoParcelas";

describe("data original dos débitos parcelados", () => {
  it("vale de R$ 400 em julho mantém duas parcelas de R$ 200 e a data de 19/07 em agosto", () => {
    const parcela = { valor: 200, parcela_numero: 2, parcelas_total: 2, data_referencia: "2026-08-01", data_original: "2026-07-19" };
    expect(dataOriginalDesconto(parcela)).toBe("2026-07-19");
    expect(parcela.data_referencia).toBe("2026-08-01");
  });
  it.each(["adiantamento", "vale", "outros"])("%s de julho mantém a data original na parcela de agosto", (tipo) => {
    const parcela = { tipo, data_referencia: "2026-08-01", data_original: "2026-07-10" };
    expect(dataOriginalDesconto(parcela)).toBe("2026-07-10");
    expect(parcela.data_referencia).toBe("2026-08-01");
  });
  it("não inventa data original para registro antigo sem origem recuperável", () => {
    expect(dataOriginalDesconto({ data_referencia: "2026-08-01", data_original: null, descricao: "Adiantamento salarial — parcela 2/2" })).toBe("");
  });
  it("mantém a data de um desconto não parcelado", () => {
    expect(dataOriginalDesconto({ data_referencia: "2026-08-10" })).toBe("2026-08-10");
  });
});