import { describe, expect, it } from "vitest";
import { documentoDoProprietario } from "../../../supabase/functions/vehicle-debts-sync/proprietario";

describe("documento cadastral do proprietário", () => {
  it("recupera o CNPJ da filial Tocantins em vínculo antigo por user_id", () => {
    expect(documentoDoProprietario("legacy", [{ id: "profile", user_id: "legacy", cnpj: "23662751000250" }])).toBe("23662751000250");
  });
  it("prioriza o cadastro selecionado pelo id interno", () => {
    expect(documentoDoProprietario("selected", [
      { id: "other", user_id: "selected", cnpj: "23662751000179" },
      { id: "selected", user_id: null, cnpj: "23662751000250" },
    ])).toBe("23662751000250");
  });
  it("não escolhe outra empresa quando não existe vínculo", () => {
    expect(documentoDoProprietario("missing", [{ id: "other", user_id: null, cnpj: "23662751000179" }])).toBe("");
  });
  it("recusa vínculo antigo ambíguo", () => {
    expect(() => documentoDoProprietario("legacy", [
      { id: "a", user_id: "legacy", cnpj: "23662751000179" },
      { id: "b", user_id: "legacy", cnpj: "23662751000250" },
    ])).toThrow("Mais de um proprietário");
  });
});