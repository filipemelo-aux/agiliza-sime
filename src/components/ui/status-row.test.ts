import { describe, it, expect } from "vitest";
import { rowToneClass } from "./status-row";

describe("rowToneClass", () => {
  it("pinta linha em análise com a cor própria (review)", () => {
    expect(rowToneClass("review")).toBe("bg-review/15 hover:bg-review/25");
  });

  it("não repete a cor de análise com as demais situações", () => {
    const review = rowToneClass("review");
    expect(review).not.toBe(rowToneClass("pending"));
    expect(review).not.toBe(rowToneClass("resolved"));
    expect(review).not.toBe(rowToneClass("overdue"));
    expect(review).not.toBe(rowToneClass("cancelled"));
    expect(review).not.toBe(rowToneClass("neutral"));
  });
});
