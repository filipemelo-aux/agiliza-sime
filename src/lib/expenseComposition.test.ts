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