import { describe, it, expect } from "vitest";
import { situacaoDocumento, resumoPorTipo, situacaoVeiculo, situacaoComConsulta } from "./fleetDocumentStatus";

const hoje = "2026-11-16";
const doc = (o: any) => ({ tipo_documento: "IPVA", status_pagamento: "A Vencer", valor_total: 100, ...o });

describe("situação de documentos da frota", () => {
  it("vencimento passado e não pago é vencido mesmo com status 'A Vencer'", () => {
    expect(situacaoDocumento(doc({ data_vencimento: "2026-11-15" }), hoje)).toBe("vencido");
  });
  it("vence em até 30 dias é a vencer", () => {
    expect(situacaoDocumento(doc({ data_vencimento: "2026-12-16" }), hoje)).toBe("a_vencer");
  });
  it("vence em mais de 30 dias é em dia", () => {
    expect(situacaoDocumento(doc({ data_vencimento: "2026-12-17" }), hoje)).toBe("em_dia");
  });
  it("pago nunca é vencido", () => {
    expect(situacaoDocumento(doc({ data_vencimento: "2025-01-01", status_pagamento: "Pago" }), hoje)).toBe("em_dia");
  });
  it("multas em aberto somam quantidade e valor", () => {
    const r = resumoPorTipo([
      doc({ tipo_documento: "Multa", data_vencimento: "2026-12-30", valor_total: 195.23 }),
      doc({ tipo_documento: "Multa", data_vencimento: "2026-10-01", valor_total: 130.16 }),
      doc({ tipo_documento: "Multa", data_vencimento: "2026-09-01", valor_total: 88, status_pagamento: "Pago" }),
    ], "Multa", hoje);
    expect(r).toEqual({ situacao: "vencido", vencimento: "2026-10-01", abertos: 2, valorAberto: 325.39 });
  });
  it("veículo assume a pior situação", () => {
    expect(situacaoVeiculo([
      { situacao: "em_dia", vencimento: null, abertos: 0, valorAberto: 0 },
      { situacao: "a_vencer", vencimento: null, abertos: 1, valorAberto: 0 },
      { situacao: "sem_registro", vencimento: null, abertos: 0, valorAberto: 0 },
    ])).toBe("a_vencer");
  });
  it("consulta ao Detran sem débitos deixa veículo sem registro em dia", () => {
    expect(situacaoComConsulta("sem_registro", true)).toBe("em_dia");
  });
  it("consulta sem débitos não esconde documento vencido", () => {
    expect(situacaoComConsulta("vencido", true)).toBe("vencido");
  });
  it("sem consulta limpa, sem registro continua sem registro", () => {
    expect(situacaoComConsulta("sem_registro", false)).toBe("sem_registro");
  });
});
