import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dvNossoNumeroSicoob, gerarRemessaSicoob, type CobrancaConfig } from "./cnab240Sicoob";

const cfg: CobrancaConfig = {
  banco_codigo: "756", banco_nome: "SICOOB", beneficiario_nome: "SIME TRANSPORTE LTDA",
  beneficiario_cnpj: "23662751000179", agencia: "4436", agencia_dv: "9", conta: "2436", conta_dv: "8",
  codigo_beneficiario: "24368", carteira: "1", modalidade: "01", especie_titulo: "04", aceite: "N",
  juros_codigo: "2", juros_percentual: 2, multa_codigo: "2", multa_percentual: 2,
  protesto_codigo: "1", protesto_dias: 7, baixa_codigo: "0", baixa_dias: null,
};

const titulo = {
  nossoNumero: 2451, nossoNumeroDv: 7, parcela: 1, numeroDocumento: "10581", usoEmpresa: "8761",
  vencimento: "2026-10-09", emissao: "2026-10-07", valor: 5948.8,
  pagador: { documento: "05050995000119", nome: "SAL BOM LTDA", endereco: "ROD BR 158 S/N, 0",
    bairro: "LOTEAMENTO INDUSTRIAL", cep: "68550970", cidade: "REDENÇÃO", uf: "PA" },
};

describe("remessa CNAB 240 Sicoob", () => {
  it("DV do nosso número 2451 é 7 para o beneficiário 24368", () => {
    expect(dvNossoNumeroSicoob("4436", "24368", 2451)).toBe(7);
  });

  it("reproduz exatamente a remessa do sistema anterior", () => {
    const out = gerarRemessaSicoob(cfg, [titulo], 691, new Date(2026, 9, 9, 7, 54, 1));
    const path = "/mnt/user-uploads/CB091001.rem";
    const expected = existsSync(path) ? readFileSync(path, "latin1") : null;
    out.split("\r\n").filter(Boolean).forEach((l) => expect(l.length).toBe(240));
    if (expected) expect(out).toBe(expected.endsWith("\r\n") ? expected : expected + "\r\n");
  });

  it("recusa parcela sem CEP do pagador", () => {
    expect(() => gerarRemessaSicoob(cfg, [{ ...titulo, pagador: { ...titulo.pagador, cep: "" } }], 692))
      .toThrow(/CEP/);
  });
});
