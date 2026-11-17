import { describe, it, expect } from "vitest";
import { normalizar, endpointDebitos } from "../../../supabase/functions/vehicle-debts-sync/normalize";

describe("normalizar débitos do Detran", () => {
  it("PA: IPVA no ano seguinte ao último licenciamento e multas por auto", () => {
    const r = normalizar("PA", {
      ano_licenciamento: "2025", normalizado_valor_ipva: 1643.78,
      infracoes: [
        { auto_infracao: "ESA2425640", data_hora: "05/05/202615:59", normalizado_valor: 201.37, status: "A PAGAR", descricao: "ESTACIONAR", municipio: "GRAJAU" },
        { auto_infracao: "AT00149633", data_hora: "12/07/202611:45", normalizado_valor: 130.16, status: "A PAGAR", descricao: "VELOCIDADE", municipio: "ARAGUAINA" },
      ],
    }, "2026-11-17");
    expect(r.map((d) => [d.tipo, d.ano, d.valor, d.vencimento])).toEqual([
      ["IPVA", 2026, 1643.78, "2026-11-17"],
      ["Multa", 2026, 201.37, "2026-05-05"],
      ["Multa", 2026, 130.16, "2026-07-12"],
    ]);
  });
  it("MA: soma parcelas de IPVA por ano e não repete multa", () => {
    const r = normalizar("MA", {
      ipva: [{ ano: 2025, data_vencimento: "11/03/2025", normalizado_saldo_devedor: 10 }, { ano: 2025, data_vencimento: "11/04/2025", normalizado_saldo_devedor: 5.5 }],
      debitos: [{ descricao: "TAXA LICENCIAMENTO", vencimento: "29/09/2025", normalizado_valor_atual: 85.13 }],
      penalidades_multas: [{ auto: "1-1", normalizado_valor: 85.13, local_complemento: "no dia 02/03/2024 11:11" }],
      infracoes_autuacao: [{ auto: "1-1", normalizado_valor: 85.13 }],
    }, "2026-11-17");
    expect(r.map((d) => [d.tipo, d.ano, d.valor])).toEqual([["IPVA", 2025, 15.5], ["Licenciamento", 2025, 85.13], ["Multa", 2024, 85.13]]);
  });
  it("só MA e PA trazem débitos", () => {
    expect(endpointDebitos("PA")).toBe("detran/pa/veiculo");
    expect(endpointDebitos("GO")).toBeNull();
  });
  it("MA: auto de infração da SEFAZ é IPVA por ano", () => {
    const r = normalizar("MA", { outros_debitos_sefaz: [
      { ano: "2023", tipo: "AUTO DE INFRACAO", numero_documento: "1", normalizado_saldo_devedor: 900 },
      { ano: "2024", tipo: "AUTO DE INFRACAO", numero_documento: "2", normalizado_saldo_devedor: 1000.5 },
    ] }, "2026-11-17");
    expect(r.map((d) => [d.tipo, d.ano, d.valor])).toEqual([["IPVA", 2023, 900], ["IPVA", 2024, 1000.5]]);
  });
});
