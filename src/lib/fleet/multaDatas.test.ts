import { describe, it, expect } from "vitest";
import { datasDebito } from "./multaDatas";
describe("datasDebito", () => {
  const resp = [{ debitos: [{ descricao: "AGETO-128200-AG10193585-6270/00", data_vencimento: "18/09/2025" }] }];
  it("separa infração do vencimento real da guia", () => {
    expect(datasDebito({ tipo: "Multa", chave: "MULTA-AGETO-128200-AG10193585-6270/00", descricao: "Auto X — Em DARCINOPOLIS no dia 25/03/2025 às 16:53", vencimento: "2025-03-25" }, resp))
      .toEqual({ infracao: "25/03/2025 16:53", vencimento: "18/09/2025" });
  });
  it("não usa a data da infração como vencimento", () => {
    expect(datasDebito({ tipo: "Multa", chave: "MULTA-ZZZ", descricao: "no dia 25/03/2025", vencimento: "2025-03-25" }, []))
      .toEqual({ infracao: "25/03/2025", vencimento: null });
  });
});
