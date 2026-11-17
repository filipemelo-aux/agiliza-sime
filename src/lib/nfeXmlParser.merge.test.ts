import { describe, it, expect } from "vitest";
import { mergeNfeData, type NfeData } from "./nfeXmlParser";
const nf = (n: string, v: number, dups: [string, number][], em = "2026-11-01"): NfeData => ({
  fornecedor_nome: "X", fornecedor_cnpj: "1", emitente: {} as any, numero_nota: n, chave_nfe: "k" + n,
  data_emissao: em, valor_total: v, itens: [{ descricao: "i" + n } as any], tipo_despesa_sugerido: "", xml_original: "",
  duplicatas: dups.map(([vencimento, valor], i) => ({ numero: String(i), vencimento, valor })),
});
describe("mergeNfeData", () => {
  it("soma 4 notas, junta itens e agrupa vencimentos", () => {
    const m = mergeNfeData([nf("1", 100.1, [["2026-12-01", 100.1]]), nf("2", 200.2, [["2026-12-01", 200.2]], "2026-11-05"), nf("3", 50, [["2026-12-15", 50]]), nf("4", 9.7, [["2026-12-15", 9.7]])]);
    expect(m.valor_total).toBe(360);
    expect(m.numero_nota).toBe("1, 2, 3, 4");
    expect(m.itens).toHaveLength(4);
    expect(m.data_emissao).toBe("2026-11-05");
    expect(m.duplicatas.map((d) => d.valor)).toEqual([300.3, 59.7]);
  });
});
