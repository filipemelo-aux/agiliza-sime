import { describe, it, expect } from "vitest";
import { DACTE_LAYOUT } from "@/components/freight/dactePdf";

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
