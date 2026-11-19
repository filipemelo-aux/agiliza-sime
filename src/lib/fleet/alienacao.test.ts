import { describe, it, expect } from "vitest";
import { extrairAlienacao } from "./alienacao";

describe("extrairAlienacao", () => {
  it("MA com alienação mostra o credor", () => {
    const r = extrairAlienacao({ data: [{ informacao_gravame: "Registro de Alienação Fiduciária informado por ADEMILAR DE ADM CON em 10/01/2024" }] });
    expect(r).toEqual({ status: "alienado", texto: "ADEMILAR DE ADM CON" });
  });
  it("MA sem pendência é livre", () => {
    expect(extrairAlienacao({ data: [{ informacao_gravame: "Nenhuma informação pendente até esta data" }] })?.status).toBe("livre");
  });
  it("TO 'Sem gravame' é livre", () => {
    expect(extrairAlienacao({ data: [{ restricoes: ["Sem gravame"], restricao_venda: "Sem gravame" }] })?.status).toBe("livre");
  });
  it("TO com alienação é alienado", () => {
    expect(extrairAlienacao({ data: [{ restricao_venda: "Alienação fiduciária - BANCO X" }] })?.status).toBe("alienado");
  });
  it("sem campo de gravame retorna null", () => {
    expect(extrairAlienacao({ data: [{ ipva: [] }] })).toBeNull();
  });
});
