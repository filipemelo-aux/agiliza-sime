import { describe, it, expect } from "vitest";
import { normalizar, endpointDebitos, documentoObrigatorio } from "../../../supabase/functions/vehicle-debts-sync/normalize";

describe("SEFAZ-GO IPVA", () => {
  it("GO consulta SEFAZ-GO só com placa e RENAVAM", () => {
    expect(endpointDebitos("GO")).toBe("sefaz/go/ipva");
    expect(documentoObrigatorio("GO")).toBe(false);
  });
  it("soma guias por exercício sem repetir guia duplicada", () => {
    const g = { numero_processo: "P1", exercicio: "2025", normalizado_valor: 1734.41 };
    const r = normalizar("GO", { guias: [g, { ...g }, { numero_processo: "P2", exercicio: "2026", normalizado_valor: 100 }] }, "2026-11-18");
    expect(r.map((d) => [d.tipo, d.ano, d.valor, d.chave])).toEqual([
      ["IPVA", 2025, 1734.41, "IPVA-SEFAZGO-2025"],
      ["IPVA", 2026, 100, "IPVA-SEFAZGO-2026"],
    ]);
  });
});
