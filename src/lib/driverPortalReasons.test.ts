import { describe, expect, it } from "vitest";
import { validatePortalReasons } from "../../supabase/functions/_shared/driverPortalReasons";

describe("Motivos de reembolso do portal", () => {
  it("preserva os motivos e a ordem definidos pelo usuário", () => {
    expect(validatePortalReasons([" Alimentação ", "Estacionamento", "Pedágio"])).toEqual(["Alimentação", "Estacionamento", "Pedágio"]);
  });
  it("impede motivos vazios ou repetidos", () => {
    expect(() => validatePortalReasons([" "])).toThrow();
    expect(() => validatePortalReasons(["Pedágio", "pedágio"])).toThrow();
  });
});