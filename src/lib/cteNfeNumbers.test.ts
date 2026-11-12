import { describe, expect, it } from "vitest";
import { cteNfeNumeros, numeroNfeDaChave } from "./cteNfeNumbers";

// Chaves reais gravadas no banco (número da NF-e na posição 26 a 34).
const CHAVE_175296 = "21261100913051000104550010001752961998247034";
const CHAVE_10077 = "15261145441408000137550010000100771999899229";

describe("numeroNfeDaChave", () => {
  it("lê o número da NF-e na chave de acesso e remove zeros à esquerda", () => {
    expect(numeroNfeDaChave(CHAVE_175296)).toBe("175296");
    expect(numeroNfeDaChave(CHAVE_10077)).toBe("10077");
  });

  it("ignora chave fora do layout de 44 dígitos", () => {
    expect(numeroNfeDaChave("123")).toBe("");
    expect(numeroNfeDaChave(null)).toBe("");
  });
});

describe("cteNfeNumeros", () => {
  it("usa o número do detalhe salvo", () => {
    expect(
      cteNfeNumeros({ nfe_detalhes: [{ numero: "175296", chave: CHAVE_175296 }] }),
    ).toEqual(["175296"]);
  });

  it("cai para a chave quando o detalhe não tem número", () => {
    expect(cteNfeNumeros({ nfe_detalhes: [{ chave: CHAVE_10077 }] })).toEqual(["10077"]);
  });

  it("puxa das chaves referenciadas quando não há detalhe", () => {
    expect(cteNfeNumeros({ chaves_nfe_ref: [CHAVE_10077] })).toEqual(["10077"]);
  });

  it("não repete a mesma NF-e vinda de detalhe e de chave", () => {
    expect(
      cteNfeNumeros({
        nfe_detalhes: [{ numero: "175296", chave: CHAVE_175296 }],
        chaves_nfe_ref: [CHAVE_175296],
      }),
    ).toEqual(["175296"]);
  });

  it("lista mais de uma NF-e na ordem em que aparecem", () => {
    expect(
      cteNfeNumeros({
        nfe_detalhes: [{ numero: "42" }, { numero: "43" }],
      }),
    ).toEqual(["42", "43"]);
  });

  it("volta vazio quando o CT-e não referencia documento", () => {
    expect(cteNfeNumeros({ nfe_detalhes: [], chaves_nfe_ref: [] })).toEqual([]);
    expect(cteNfeNumeros(null)).toEqual([]);
  });
});
