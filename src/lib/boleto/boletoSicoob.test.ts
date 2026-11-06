import { describe, expect, it } from "vitest";
import { codigoBarras, dvBarras, fatorVencimento, linhaDigitavel, mod10 } from "./boletoSicoob";

describe("boleto Sicoob", () => {
  it("fator de vencimento reinicia em 1000 em 22/02/2025", () => {
    expect(fatorVencimento("2025-02-21")).toBe("9999");
    expect(fatorVencimento("2025-02-22")).toBe("1000");
  });
  it("módulos 10 e 11 seguem Febraban", () => {
    expect(mod10("001905009")).toBe(5);
    expect(dvBarras("0019373700000001000500940144816060680935031")).toBe(3);
  });
  it("código de 44 dígitos com banco 756 e linha digitável consistente", () => {
    const b = codigoBarras({ carteira: "1", agencia: "4436", modalidade: "01", codigoBeneficiario: "24368", nossoNumero: 2452, nossoNumeroDv: 4, parcela: 1, vencimento: "2026-11-09", valor: 24064 });
    expect(b).toHaveLength(44);
    expect(b.slice(0, 4)).toBe("7569");
    expect(b.slice(9, 19)).toBe("0002406400");
    expect(b.slice(19)).toBe("1443601002436800024524001");
    expect(dvBarras(b.slice(0, 4) + b.slice(5))).toBe(Number(b[4]));
    expect(linhaDigitavel(b).replace(/\D/g, "")).toHaveLength(47);
  });
});
