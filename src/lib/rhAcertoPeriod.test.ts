import { describe, it, expect } from "vitest";
import { getAcertoPeriod, inAcertoPeriod, buildQuinzena } from "./rhAcertoPeriod";
import { formatDateBR } from "./date";

describe("getAcertoPeriod", () => {
  it("a quinzena 16–31/10 exclui viagens de 15/10 e inclui as duas datas-limite", () => {
    const periodo = buildQuinzena(2026, 9, 2);
    expect(inAcertoPeriod("2026-10-15", periodo)).toBe(false);
    expect(inAcertoPeriod("2026-10-16", periodo)).toBe(true);
    expect(inAcertoPeriod("2026-10-31", periodo)).toBe(true);
    expect(inAcertoPeriod("2026-11-01", periodo)).toBe(false);
  });
  it("a data de uma viagem de 16/10 não retrocede para 15/10 na apresentação", () => {
    expect(formatDateBR("2026-10-16")).toBe("16/10/2026");
    expect(formatDateBR("2026-10-15")).toBe("15/10/2026");
  });
  it("exclui a viagem de 15/10 às 23:59 armazenada como 16/10 às 02:59 UTC", () => {
    const periodo = buildQuinzena(2026, 9, 2);
    expect(formatDateBR("2026-10-16T02:59:00+00:00")).toBe("15/10/2026");
    expect(inAcertoPeriod("2026-10-16T02:59:00+00:00", periodo)).toBe(false);
    expect(inAcertoPeriod("2026-10-16T03:00:00+00:00", periodo)).toBe(true);
  });
  it("dias 01–05 buscam 16 ao fim do mês anterior", () => {
    expect(getAcertoPeriod(new Date(2026, 10, 3, 12))).toMatchObject({ inicio: "2026-10-16", fim: "2026-10-31" });
    expect(getAcertoPeriod(new Date(2026, 2, 1, 12))).toMatchObject({ inicio: "2026-02-16", fim: "2026-02-28" });
    expect(getAcertoPeriod(new Date(2027, 0, 5, 12))).toMatchObject({ inicio: "2026-12-16", fim: "2026-12-31" });
  });
  it("dias 16–20 buscam 01 a 15 do mês corrente", () => {
    expect(getAcertoPeriod(new Date(2026, 10, 16, 12))).toMatchObject({ inicio: "2026-11-01", fim: "2026-11-15" });
    expect(getAcertoPeriod(new Date(2026, 10, 20, 12))).toMatchObject({ inicio: "2026-11-01", fim: "2026-11-15" });
  });
});

import { listQuinzenas } from "./rhAcertoPeriod";
describe("listQuinzenas", () => {
  it("oferece só quinzenas fechadas, com a atual padrão e a virada de ano correta", () => {
    const l = listQuinzenas(new Date(2027, 0, 4, 12), 2, 2);
    expect(l.map((q) => `${q.inicio}|${q.fim}`)).toEqual([
      "2027-01-16|2027-01-31", "2027-01-01|2027-01-15", "2026-12-16|2026-12-31",
      "2026-12-01|2026-12-15", "2026-11-16|2026-11-30",
    ]);
  });
});
