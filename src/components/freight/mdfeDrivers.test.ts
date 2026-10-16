import { beforeEach, describe, expect, it, vi } from "vitest";
import { driverCpf, resolveMdfeDrivers } from "./mdfeDrivers";

const db = vi.hoisted(() => ({ profiles: [] as any[], documents: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => ({ select: () => ({ in: async () => ({ data: table === "profiles" ? db.profiles : db.documents, error: null }) }) }) } }));
beforeEach(() => { db.profiles = []; db.documents = []; });
describe("MDF-e driver CPF snapshots", () => {
  it("prints an existing manifest CPF from the internal driver profile", async () => {
    db.profiles = [{ id: "driver", full_name: "Condutor", cnpj: "123.456.789-09" }];
    expect((await resolveMdfeDrivers([{ id: "driver", nome: "Condutor" }]))[0].cpf).toBe("12345678909");
  });
  it("preserves the CPF imported with an authorized document", async () => {
    db.profiles = [{ id: "driver", cnpj: "98765432100" }];
    expect((await resolveMdfeDrivers([{ id: "driver", nome: "Condutor", cpf: "12345678909" }]))[0].cpf).toBe("12345678909");
  });
  it("resolves auxiliary drivers as well", async () => {
    db.profiles = [{ id: "aux", full_name: "Auxiliar", cnpj: "98765432100" }];
    expect((await resolveMdfeDrivers([{ nome: "Principal", cpf: "12345678909" }, { id: "aux", nome: "Auxiliar" }]))[1].cpf).toBe("98765432100");
  });
  it("uses linked auth document data only after resolving the internal profile", async () => {
    db.profiles = [{ id: "driver", user_id: "auth-driver", cnpj: null }];
    db.documents = [{ user_id: "auth-driver", cpf: "123.456.789-09" }];
    expect((await resolveMdfeDrivers([{ id: "driver" }]))[0].cpf).toBe("12345678909");
  });
  it("never prints a corporate CNPJ as a driver CPF", () => {
    expect(driverCpf("12.345.678/0001-90")).toBe("");
  });
});