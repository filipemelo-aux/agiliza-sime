import { describe, expect, it } from "vitest";
import { validatePortalReasons } from "../../supabase/functions/_shared/driverPortalReasons";
import { portalReasonAccount } from "../../supabase/functions/_shared/driverPortalAccounts";

describe("plano de contas por motivo", () => {
  it("usa o plano definido para o motivo escolhido", () => {
    expect(portalReasonAccount({ Borracharia: "conta-borracharia", Pedágio: "conta-pedagio" }, "Borracharia")).toBe("conta-borracharia");
    expect(portalReasonAccount({ Borracharia: "conta-borracharia", Pedágio: "conta-pedagio" }, "Pedágio")).toBe("conta-pedagio");
  });
  it("mantém sem classificação os motivos ainda não configurados", () => {
    expect(portalReasonAccount({}, "Borracharia")).toBeNull();
    expect(portalReasonAccount(null, "Borracharia")).toBeNull();
    expect(portalReasonAccount({}, "toString")).toBeNull();
  });
});

describe("Motivos de reembolso do portal", () => {
  it("ordena os motivos alfabeticamente e limpa espaços das bordas", () => {
    expect(validatePortalReasons([" Alimentação ", "Estacionamento", "Pedágio"])).toEqual(["Alimentação", "Estacionamento", "Pedágio"]);
  });
  it("reordena independentemente da ordem digitada", () => {
    expect(validatePortalReasons(["Pedágio", "borracharia", "Alimentação"])).toEqual(["Alimentação", "borracharia", "Pedágio"]);
  });
  it("ordena sem diferenciar maiúsculas, minúsculas e acentos", () => {
    expect(validatePortalReasons(["Zebra", "Água", "lavagem"])).toEqual(["Água", "lavagem", "Zebra"]);
  });
  it("impede motivos vazios ou repetidos", () => {
    expect(() => validatePortalReasons([" "])).toThrow();
    expect(() => validatePortalReasons(["Pedágio", "pedágio"])).toThrow();
  });
});
