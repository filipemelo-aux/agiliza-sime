import { describe, expect, it } from "vitest";
import { maskPlateInput, validatePlate } from "./masks";

describe("maskPlateInput — formato antigo e Mercosul", () => {
  it("bloqueia dígitos nas três primeiras posições", () => {
    expect(maskPlateInput("1B2C3D4")).toBe("BCD-4");
  });

  it("exige dígito na 4ª posição", () => {
    expect(maskPlateInput("ABCD123")).toBe("ABC-123");
  });

  it("aceita formato antigo ABC1234 (5ª posição dígito)", () => {
    expect(maskPlateInput("abc1234")).toBe("ABC-1234");
  });

  it("aceita Mercosul ABC1D23 (5ª posição letra)", () => {
    expect(maskPlateInput("abc1d23")).toBe("ABC-1D23");
  });

  it("só aceita dígitos nas duas últimas posições", () => {
    expect(maskPlateInput("ABC12D3")).toBe("ABC-123");
    expect(maskPlateInput("ABC1D2E")).toBe("ABC-1D2");
  });

  it("ignora símbolos e espaços e limita a 7 caracteres", () => {
    expect(maskPlateInput("ab-c1d23x")).toBe("ABC-1D23");
  });
});

describe("validatePlate — aceita os dois formatos", () => {
  it("valida formato antigo e Mercosul e rejeita padrões inválidos", () => {
    expect(validatePlate("ABC1234")).toBe(true);
    expect(validatePlate("ABC1D23")).toBe(true);
    expect(validatePlate("ABCD123")).toBe(false);
    expect(validatePlate("ABC12DE")).toBe(false);
  });
});
