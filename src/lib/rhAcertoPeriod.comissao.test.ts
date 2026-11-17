import { describe, it, expect } from "vitest";
import { buildQuinzena, fimJanelaComissao, inJanelaComissao } from "./rhAcertoPeriod";

describe("janela de comissões do acerto", () => {
  const q1 = buildQuinzena(2026, 9, 1); // 01–15/10
  const q2 = buildQuinzena(2026, 9, 2); // 16–31/10
  it("1ª quinzena vai até dia 20", () => {
    expect(fimJanelaComissao(q1)).toBe("2026-10-20");
    expect(inJanelaComissao("2026-10-20", q1)).toBe(true);
    expect(inJanelaComissao("2026-10-21", q1)).toBe(false);
  });
  it("2ª quinzena vai até dia 5 do mês seguinte", () => {
    expect(fimJanelaComissao(q2)).toBe("2026-11-05");
    expect(inJanelaComissao("2026-11-05", q2)).toBe(true);
    expect(inJanelaComissao("2026-11-06", q2)).toBe(false);
    expect(inJanelaComissao("2026-10-15", q2)).toBe(false);
  });
  it("dezembro vira para janeiro", () => {
    expect(fimJanelaComissao(buildQuinzena(2026, 11, 2))).toBe("2027-01-05");
  });
});
