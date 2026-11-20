import { describe, it, expect } from "vitest";
import { DACTE_LAYOUT } from "@/components/freight/dactePdf";
import { resolveCteCfop } from "@/lib/cteCfop";

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("padrão vetorial do DACTE", () => {
  it("mantém a geometria A4 aprovada", () => {
    expect(DACTE_LAYOUT).toEqual({
      version: "oficial-57-2026-10-02",
      unit: "pt",
      format: "a4",
      orientation: "portrait",
      width: 595.28,
      height: 841.89,
      contentLeft: 27,
      contentRight: 568,
      contentTop: 25,
      contentBottom: 807,
    });
    expect(Object.isFrozen(DACTE_LAYOUT)).toBe(true);
  });
});

describe("CFOP automático do CT-e", () => {
  it("seleciona operação interna ou interestadual pela UF da prestação", () => {
    expect(resolveCteCfop("TO", "TO", "6353", 0)).toBe("5353");
    expect(resolveCteCfop("TO", "MA", "5353", 0)).toBe("6353");
  });

  it("preserva a finalidade industrial e usa CFOP de subcontratação", () => {
    expect(resolveCteCfop("TO", "TO", "6352", 0)).toBe("5352");
    expect(resolveCteCfop("TO", "MA", "5352", 0)).toBe("6352");
    expect(resolveCteCfop("TO", "TO", "6353", 1)).toBe("5360");
    expect(resolveCteCfop("TO", "MA", "5353", 1)).toBe("6360");
  });

  it("não altera o CFOP enquanto a rota estiver incompleta", () => {
    expect(resolveCteCfop("TO", "", "6353", 0)).toBeNull();
  });
});

describe("CFOP prestação iniciada fora da UF do emitente", () => {
  it("emitente MA, início PA e fim MA → 6932 (rejeição do CT-e 8830)", () => {
    expect(resolveCteCfop("PA", "MA", "6360", 1, "MA")).toBe("6932");
  });
  it("emitente MA, início e fim no PA → 5932", () => {
    expect(resolveCteCfop("PA", "PA", "5353", 0, "MA")).toBe("5932");
  });
  it("início na UF do emitente mantém 6360", () => {
    expect(resolveCteCfop("MA", "TO", "6360", 1, "MA")).toBe("6360");
  });
});
