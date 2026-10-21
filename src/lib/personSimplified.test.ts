import { describe, it, expect } from "vitest";
import { validateInformalSupplier, isInformalSupplierAccount } from "./personSimplified";

const base = {
  full_name: "Borracharia do Zé",
  person_type: "cpf",
  cpf: "",
  cnpj: "",
  phone: "",
  email: "",
  address_city: "",
  address_state: "",
};

describe("validateInformalSupplier", () => {
  it("exige ao menos um contato entre CPF/CNPJ, telefone e e-mail", () => {
    expect(
      validateInformalSupplier({ ...base, address_city: "Araguaína", address_state: "TO" })
    ).toMatch(/CPF\/CNPJ, Telefone ou E-mail/);
  });

  it("aceita cadastro apenas com telefone", () => {
    expect(
      validateInformalSupplier({ ...base, phone: "(63) 99999-9999", address_city: "Araguaína", address_state: "TO" })
    ).toBeNull();
  });

  it("aceita cadastro apenas com e-mail", () => {
    expect(
      validateInformalSupplier({ ...base, email: "lava@jato.com", address_city: "Araguaína", address_state: "TO" })
    ).toBeNull();
  });

  it("aceita cadastro apenas com CPF", () => {
    expect(
      validateInformalSupplier({ ...base, cpf: "111.444.777-35", address_city: "Araguaína", address_state: "TO" })
    ).toBeNull();
  });

  it("exige cidade e UF", () => {
    expect(validateInformalSupplier({ ...base, phone: "(63) 99999-9999" })).toMatch(/Cidade/);
    expect(
      validateInformalSupplier({ ...base, phone: "(63) 99999-9999", address_city: "Araguaína" })
    ).toMatch(/UF/);
  });

  it("exige nome", () => {
    expect(
      validateInformalSupplier({ ...base, full_name: "", phone: "(63) 99999-9999", address_city: "Araguaína", address_state: "TO" })
    ).toMatch(/Nome/);
  });

  it("recusa documento incompleto mesmo com contato", () => {
    expect(
      validateInformalSupplier({ ...base, cpf: "111.444", phone: "(63) 99999-9999", address_city: "Araguaína", address_state: "TO" })
    ).toMatch(/incompleto/);
  });

  it("pessoa jurídica sem CNPJ pode salvar com telefone; CNPJ parcial é recusado", () => {
    expect(
      validateInformalSupplier({ ...base, person_type: "cnpj", phone: "(63) 99999-9999", address_city: "Araguaína", address_state: "TO" })
    ).toBeNull();
    expect(
      validateInformalSupplier({ ...base, person_type: "cnpj", cnpj: "05.050.995/0001-1", address_city: "Araguaína", address_state: "TO" })
    ).toMatch(/CNPJ incompleto/);
  });
});

describe("isInformalSupplierAccount", () => {
  it("habilita apenas borracharia 2.1.2.03 e lavajato 2.1.3.05", () => {
    expect(isInformalSupplierAccount("2.1.2.03")).toBe(true);
    expect(isInformalSupplierAccount("2.1.3.05")).toBe(true);
    expect(isInformalSupplierAccount("2.1.3.01")).toBe(false);
    expect(isInformalSupplierAccount("2.1.3.02")).toBe(false);
    expect(isInformalSupplierAccount("")).toBe(false);
    expect(isInformalSupplierAccount(null)).toBe(false);
  });
});
