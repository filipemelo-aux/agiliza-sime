import { describe, expect, it } from "vitest";
import { expenseCompositionTotal, sumExpenseItems } from "./expenseComposition";

describe("Composição de despesas", () => {
  it("só peças soma quantidade vezes valor, sem serviço", () => {
    const parts = sumExpenseItems([{ quantidade: 2, valor_unitario: 125.5 }]);
    expect(expenseCompositionTotal("pecas", parts, 80, 999)).toBe(251);
  });
  it("só serviço não inclui peças nem cria total duplicado", () => {
    expect(expenseCompositionTotal("servico", 251, 80, 999)).toBe(80);
  });
  it("peças e serviço somam ambos os subtotais uma única vez", () => {
    expect(expenseCompositionTotal("misto", 251, 80, 999)).toBe(331);
  });
  it("despesa geral conserva o valor manual", () => {
    expect(expenseCompositionTotal("geral", 251, 80, 999)).toBe(999);
  });
  it("arredonda a soma em centavos", () => {
    expect(sumExpenseItems([{ quantidade: 3, valor_unitario: 0.1 }])).toBe(0.3);
  });
});
import { compositionFromAccountCode } from "./expenseComposition";
describe("compositionFromAccountCode", () => {
  it("peças: 2.1.3.01 e 2.1.6.05", () => {
    expect(compositionFromAccountCode("2.1.3.01")).toBe("pecas");
    expect(compositionFromAccountCode("2.1.6.05")).toBe("pecas");
  });
  it("serviço: 2.1.3.02 a 06 e 2.1.6.02", () => {
    for (const c of ["2.1.3.02", "2.1.3.03", "2.1.3.04", "2.1.3.05", "2.1.3.06", "2.1.6.02"]) expect(compositionFromAccountCode(c)).toBe("servico");
  });
  it("demais contas: geral", () => {
    expect(compositionFromAccountCode("2.1.1.01")).toBe("geral");
    expect(compositionFromAccountCode("2.1.3.07")).toBe("geral");
  });
});
