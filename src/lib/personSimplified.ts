/**
 * Cadastro simplificado de fornecedor informal (borracharia / lavajato).
 * Regra: habilitado EXCLUSIVAMENTE quando o cadastro é aberto a partir do
 * lançamento de despesa com uma das contas contábeis abaixo. Em qualquer
 * outra tela o cadastro de fornecedor permanece estrito.
 * Exige Cidade/UF e ao menos um contato (CPF/CNPJ, telefone ou e-mail) —
 * nunca salva com os três vazios. Rua, número e bairro são opcionais.
 */
export const INFORMAL_SUPPLIER_ACCOUNT_CODES = ["2.1.2.03", "2.1.3.05"];

export function isInformalSupplierAccount(code: string | null | undefined): boolean {
  return INFORMAL_SUPPLIER_ACCOUNT_CODES.includes((code || "").trim());
}

export interface InformalSupplierForm {
  full_name: string;
  person_type: string;
  cpf: string;
  cnpj: string;
  phone: string;
  email: string;
  address_city: string;
  address_state: string;
}

/** Valida o cadastro simplificado: Nome, Cidade/UF e ao menos um contato. */
export function validateInformalSupplier(form: InformalSupplierForm): string | null {
  const isPJ = form.person_type === "cnpj";
  const missing: string[] = [];
  if (!form.full_name.trim()) missing.push(isPJ ? "Razão Social" : "Nome");
  if (!form.address_city.trim()) missing.push("Cidade");
  if (!form.address_state.trim()) missing.push("UF");

  const docDigits = (isPJ ? form.cnpj : form.cpf).replace(/\D/g, "");
  const docOk = isPJ ? docDigits.length === 14 : docDigits.length === 11;
  const hasPhone = form.phone.replace(/\D/g, "").length >= 10;
  const hasEmail = /\S+@\S+\.\S+/.test(form.email.trim());
  if (!docOk && !hasPhone && !hasEmail) {
    missing.push("CPF/CNPJ, Telefone ou E-mail (ao menos um)");
  }
  if (missing.length) return `Preencha: ${missing.join(", ")}.`;

  // Documento digitado parcialmente (sem outro contato bastando) deve ser completo ou vazio.
  if (!docOk && docDigits.length > 0) {
    return isPJ
      ? "CNPJ incompleto — informe os 14 dígitos ou deixe o campo vazio."
      : "CPF incompleto — informe os 11 dígitos ou deixe o campo vazio.";
  }
  return null;
}
