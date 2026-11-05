import { describe, it, expect } from "vitest";
import { buildPeriodoQuinzenal } from "@/services/rh/rhViewModel";
import { buildQuinzena, inAcertoPeriod, listQuinzenas } from "./rhAcertoPeriod";
import { validateRHPeriodConfig } from "./rhPeriodConfig";
import { parcelasVale } from "./rh/valeParcelas";
describe("Competências e prazos compartilhados do RH", () => {
  it("1 a 15, acerto até 20 do mesmo mês", () => {
    expect(buildPeriodoQuinzenal("2026-11", "primeira_quinzena")).toEqual({ tipo: "primeira_quinzena", data_inicio: "2026-11-01", data_fim: "2026-11-15", data_pagamento: "2026-11-20" });
  });
  it("16 a 31, acerto até 5 do mês seguinte", () => {
    expect(buildPeriodoQuinzenal("2026-12", "segunda_quinzena")).toEqual({ tipo: "segunda_quinzena", data_inicio: "2026-12-16", data_fim: "2026-12-31", data_pagamento: "2027-01-05" });
  });
  it("segunda quinzena termina no último dia real de fevereiro", () => {
    expect(buildPeriodoQuinzenal("2028-02", "segunda_quinzena").data_fim).toBe("2028-02-29");
  });
  it("edição mantém seletor, filtro, parcelas e vencimento alinhados", () => {
    const c = { firstEndDay: 14, firstPayDay: 19, secondPayDay: 4 };
    const p = buildQuinzena(2026, 10, 2, c);
    expect(p.inicio).toBe("2026-11-15");
    expect(inAcertoPeriod("2026-11-14", p)).toBe(false);
    expect(inAcertoPeriod("2026-11-15", p)).toBe(true);
    expect(listQuinzenas(new Date(2026, 10, 16), 0, 1, c)[0]).toEqual(p);
    expect(buildPeriodoQuinzenal("2026-11", "segunda_quinzena", c).data_pagamento).toBe("2026-12-04");
    expect(parcelasVale(100, 2, buildQuinzena(2026, 10, 1, c), c)[1].periodo).toEqual(p);
  });
  it("rejeita prazos anteriores ao fim e dias fracionados", () => {
    expect(validateRHPeriodConfig({ firstEndDay: 15, firstPayDay: 14, secondPayDay: 5 })).not.toBeNull();
    expect(validateRHPeriodConfig({ firstEndDay: 15, firstPayDay: 20, secondPayDay: 5.5 })).not.toBeNull();
  });
});
