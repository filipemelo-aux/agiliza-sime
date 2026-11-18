import { describe, it, expect } from "vitest";
import { normalizar, endpointDebitos, documentoObrigatorio } from "../../../supabase/functions/vehicle-debts-sync/normalize";

describe("normalizar débitos do Detran", () => {
  it("TO exige CPF/CNPJ antes da chamada; MA e PA não exigem", () => {
    expect(documentoObrigatorio("TO")).toBe(true);
    expect(documentoObrigatorio("MA")).toBe(false);
    expect(documentoObrigatorio("PA")).toBe(false);
  });
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
  it("MA, PA e TO usam consultas dedicadas de débitos", () => {
    expect(endpointDebitos("TO")).toBe("detran/to/veiculo");
    expect(endpointDebitos("PA")).toBe("detran/pa/veiculo");
    expect(endpointDebitos("GO")).toBeNull();
  });
  it("TO: soma parcelas por exercício e usa valor atual sem somar juros novamente", () => {
    const r = normalizar("TO", { debitos: [
      { descricao: "IPVA 2025 parcela 1", data_vencimento: "10/01/2026", valor_atual: "140.66", valor_juros: "9.20" },
      { descricao: "IPVA 2025 parcela 2", data_vencimento: "10/02/2026", normalizado_valor_atual: 100 },
      { descricao: "Licenciamento 2026", data_vencimento: "10/06/2026", valor_atual: "R$ 1.234,56" },
      { descricao: "Taxa desconhecida", valor_atual: "20.00" },
    ] }, "2026-11-18");
    expect(r.map(d => [d.tipo, d.ano, d.valor, d.vencimento])).toEqual([
      ["IPVA", 2025, 240.66, "2026-01-10"], ["Licenciamento", 2026, 1234.56, "2026-06-10"],
    ]);
  });
  it("TO: tributo combinado entra uma vez no total IPVA/licenciamento", () => {
    const r = normalizar("TO", { debitos: [{ descricao: "IPVA / LICENCIAMENTO 2026", data_vencimento: "10/06/2026", normalizado_valor_atual: 1500 }] }, "2026-11-18");
    expect(r.map(d => [d.tipo, d.ano, d.valor])).toEqual([["IPVA", 2026, 1500]]);
  });
  it("TO: multa e autuação do mesmo auto não duplicam; multas pagas não entram", () => {
    const f = { numero_autuacao: "AAAA-123-P456/00 Renainf: 999 Em aberto", descricao: "Velocidade", normalizado_data: "11/10/2025 11:00:00", valor: "R$ 130.16" };
    const r = normalizar("TO", { multas: [f, { ...f, numero_autuacao: "BBB Pago" }], infracoes_em_autuacao: [f] }, "2026-11-18");
    expect(r.map(d => [d.chave, d.valor, d.ano])).toEqual([["MULTA-AAAA-123-P456/00", 130.16, 2025]]);
  });
  it("MA: auto de infração da SEFAZ é IPVA por ano", () => {
    const r = normalizar("MA", { outros_debitos_sefaz: [
      { ano: "2023", tipo: "AUTO DE INFRACAO", numero_documento: "1", normalizado_saldo_devedor: 900 },
      { ano: "2024", tipo: "AUTO DE INFRACAO", numero_documento: "2", normalizado_saldo_devedor: 1000.5 },
    ] }, "2026-11-17");
    expect(r.map((d) => [d.tipo, d.ano, d.valor])).toEqual([["IPVA", 2023, 900], ["IPVA", 2024, 1000.5]]);
  });
});

describe('SEFAZ-TO IPVA', () => {
  it('cota única prevalece sobre parcelas e agrupa por exercício', async () => {
    const { normalizarSefazTO } = await import('../../../supabase/functions/vehicle-debts-sync/normalize.ts')
    const d = normalizarSefazTO({ pagamentos: [
      { descricao: 'IPVA 2026 COTA ÚNICA', normalizado_valor: 3000, vencimento: '20/03/2026' },
      { descricao: 'IPVA 2026 PARCELA 1/3', normalizado_valor: 1100, vencimento: '20/03/2026' },
      { descricao: 'IPVA 2025 PARCELA 1/2', valor: 'R$ 1.500,00', vencimento: '20/03/2025' },
      { descricao: 'IPVA 2025 PARCELA 2/2', valor: 'R$ 1.500,00', vencimento: '20/04/2025' },
    ] }, '2026-11-18')
    expect(d.find((x) => x.ano === 2026)?.valor).toBe(3000)
    expect(d.find((x) => x.ano === 2025)?.valor).toBe(3000)
    expect(d.every((x) => x.tipo === 'IPVA')).toBe(true)
  })
})

describe('MA licenciamento sem multas', () => {
  it('não soma multas de trânsito listadas em débitos ao licenciamento', () => {
    const r = normalizar('MA', { debitos: [
      { descricao: 'LICENCIAMENTO DO VEICULO 2025', vencimento: '16/06/2025', normalizado_valor_atual: 157.33 },
      { descricao: '01/07/2025-UF:TO-128200-FL00285286-7455-0-TRANSITAR/VELOCIDADE SUPERIOR A MAXIMA EM ATE 20% Venc. 27/10/2025', vencimento: '27/10/2025', normalizado_valor_atual: 148.87 },
    ] }, '2026-11-18')
    expect(r.find((d) => d.chave === 'LIC-2025')?.valor).toBe(157.33)
  })
})
