import { describe, it, expect } from "vitest";
import { classifyDuplicates, type DuplicateCandidate } from "./expenseDuplicates";

const base: DuplicateCandidate = { id: "a", descricao: "Pneu", favorecido_nome: "Iccap", favorecido_id: "f1", fornecedor_cnpj: "12.345.678/0001-90", documento_fiscal_numero: "26801", valor_total: 9560, data_emissao: "2026-04-08", data_vencimento: "2026-05-08", status: "pago", created_at: null };

describe("classifyDuplicates", () => {
  it("mesmo fornecedor e mesmo nº de documento é duplicidade", () => {
    expect(classifyDuplicates({ favorecidoId: "f1", documento: "026801" }, [base])[0].reason).toBe("documento");
  });
  it("mesmo fornecedor, valor e vencimento é suspeita", () => {
    expect(classifyDuplicates({ favorecidoId: "f1", valor: 9560, vencimento: "2026-05-08" }, [{ ...base, documento_fiscal_numero: null }])[0].reason).toBe("valor_vencimento");
  });
  it("fornecedor diferente não alerta", () => {
    expect(classifyDuplicates({ favorecidoId: "f2", documento: "26801" }, [base])).toHaveLength(0);
  });
  it("a própria despesa em edição não alerta", () => {
    expect(classifyDuplicates({ selfId: "a", favorecidoId: "f1", documento: "26801" }, [base])).toHaveLength(0);
  });
  it("reconhece pelo CNPJ quando não há favorecido vinculado", () => {
    expect(classifyDuplicates({ fornecedorCnpj: "12345678000190", documento: "26801" }, [{ ...base, favorecido_id: null }])).toHaveLength(1);
  });
});
