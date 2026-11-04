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
