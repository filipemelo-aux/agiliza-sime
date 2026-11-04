import { describe, it, expect } from "vitest";
import { getAcertoPeriod } from "./rhAcertoPeriod";

describe("getAcertoPeriod", () => {
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
