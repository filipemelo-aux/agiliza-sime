/**
 * Testes da regra global de inclusão no RH.
 *
 * Regra única: aparece no RH ⇔ profiles.is_colaborador_rh = true
 * (independente da category — motorista, colaborador, administrativo, etc.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  full_name: string;
  category: string;
  is_colaborador_rh: boolean;
  email?: null;
  phone?: null;
  cargo?: null;
  departamento?: null;
  data_admissao?: null;
  salario?: null;
};

const FIXTURE: Row[] = [
  // Caso 1: motorista + flag = true → DEVE aparecer
  { id: "m1", full_name: "Motorista Colaborador", category: "motorista", is_colaborador_rh: true },
  // Caso 2: motorista + flag = false → NÃO deve aparecer
  { id: "m2", full_name: "Motorista Comum", category: "motorista", is_colaborador_rh: false },
  // Caso 3: administrativo + flag = true → DEVE aparecer
  { id: "a1", full_name: "Admin RH", category: "administrativo", is_colaborador_rh: true },
  // Extra: fornecedor sem flag → NÃO deve aparecer
  { id: "f1", full_name: "Fornecedor X", category: "fornecedor", is_colaborador_rh: false },
];

vi.mock("@/integrations/supabase/client", () => {
  const buildBuilder = (rows: Row[]) => {
    const state = { rows: [...rows], filterFlag: undefined as boolean | undefined };
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        if (col === "is_colaborador_rh") state.filterFlag = val;
        return builder;
      },
      order: () => {
        let result = state.rows;
        if (state.filterFlag !== undefined) {
          result = result.filter((r) => r.is_colaborador_rh === state.filterFlag);
        }
        return Promise.resolve({ data: result, error: null });
      },
    };
    return builder;
  };

  return {
    supabase: {
      from: (_table: string) => buildBuilder(FIXTURE),
    },
  };
});

describe("fetchColaboradoresRH — regra global is_colaborador_rh", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
  });

  it("Caso 1: motorista com is_colaborador_rh=true DEVE aparecer", async () => {
    const { fetchColaboradoresRH } = await import("./rhColaboradoresService");
    const result = await fetchColaboradoresRH();
    const found = result.find((c) => c.id === "m1");
    expect(found).toBeDefined();
    expect(found?.tipo).toBe("motorista");
  });

  it("Caso 2: motorista com is_colaborador_rh=false NÃO deve aparecer", async () => {
    const { fetchColaboradoresRH } = await import("./rhColaboradoresService");
    const result = await fetchColaboradoresRH();
    expect(result.find((c) => c.id === "m2")).toBeUndefined();
  });

  it("Caso 3: administrativo com is_colaborador_rh=true DEVE aparecer", async () => {
    const { fetchColaboradoresRH } = await import("./rhColaboradoresService");
    const result = await fetchColaboradoresRH();
    const found = result.find((c) => c.id === "a1");
    expect(found).toBeDefined();
    expect(found?.tipo).toBe("outro"); // administrativo mapeia para "outro"
  });

  it("Garantia: nenhum registro sem a flag retorna no resultado", async () => {
    const { fetchColaboradoresRH } = await import("./rhColaboradoresService");
    const result = await fetchColaboradoresRH();
    expect(result.every((c) => ["m1", "a1"].includes(c.id))).toBe(true);
    expect(result).toHaveLength(2);
  });
});
