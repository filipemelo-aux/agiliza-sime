import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { canSelectDriverPortalAccess } from "./rhColaboradoresService";

describe("seleção de acessos ao portal", () => {
  it("permite Motorista como categoria principal", () => {
    expect(canSelectDriverPortalAccess({ tipo: "motorista", categories_extra: [], ativo: true })).toBe(true);
  });

  it("permite colaborador com Motorista nas categorias adicionais", () => {
    expect(canSelectDriverPortalAccess({ tipo: "colaborador", categories_extra: ["motorista"], ativo: true })).toBe(true);
  });

  it("exclui colaboradores sem categoria Motorista", () => {
    expect(canSelectDriverPortalAccess({ tipo: "colaborador", categories_extra: ["fornecedor"], ativo: true })).toBe(false);
    expect(canSelectDriverPortalAccess({ tipo: "outro", ativo: true })).toBe(false);
  });

  it("preserva a exclusão de colaboradores inativos", () => {
    expect(canSelectDriverPortalAccess({ tipo: "motorista", ativo: false })).toBe(false);
  });
});