import { describe, it, expect } from "vitest";
import { parseValorFipe, acharMarca } from "./fipe";
describe("fipe", () => {
  it("converte valor FIPE", () => expect(parseValorFipe("R$ 512.345,67")).toBe(512345.67));
  it("acha marca", () => {
    const m = [{ codigo: "1", nome: "SCANIA" }, { codigo: "2", nome: "MERCEDES-BENZ" }];
    expect(acharMarca(m, "Scania")?.codigo).toBe("1");
    expect(acharMarca(m, "M.BENZ")?.codigo).toBe("2");
  });
});
