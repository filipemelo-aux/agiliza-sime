import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/pdfDownload", () => ({ downloadHtmlAsPdf: vi.fn(), titleFromHtml: vi.fn() }));
vi.mock("@/lib/htmlToPdf", () => ({ downloadHtmlAsPdf: vi.fn() }));
import { descontosRecibo, type HoleriteItem } from "./folhaPagamentoPrint";

const item: HoleriteItem = { colaborador_nome: "Colaboradora", salario_base: 1621, comissoes: 0, adiantamentos: 0, descontos: 100, liquido: 1521 };
describe("natureza dos descontos no recibo", () => {
  it("preserva a multa lançada sem atribuir impostos", () => {
    const linhas = descontosRecibo({ ...item, descontos_detalhados: [{ tipo: "multas", descricao: "Multa", valor: 100 }] });
    expect(linhas.map(d => ({ tipo: d.tipo, valor: d.val }))).toEqual([{ tipo: "multas", valor: 100 }]);
  });
  it("separa INSS, IRRF e multa efetivamente lançados", () => {
    const linhas = descontosRecibo({ ...item, descontos: 180, descontos_detalhados: [
      { tipo: "inss", descricao: null, valor: 60 }, { tipo: "irrf", descricao: null, valor: 20 }, { tipo: "multas", descricao: "Multa", valor: 100 },
    ] });
    expect(linhas.map(d => [d.tipo, d.val])).toEqual([["inss", 60], ["irrf", 20], ["multas", 100]]);
  });
  it("parcelas de vale permanecem em adiantamentos sem duplicar o total", () => {
    const linhas = descontosRecibo({ ...item, adiantamentos: 140, descontos_detalhados: [
      { tipo: "adiantamento", descricao: "Salarial", valor: 140, parcela_numero: 2, parcelas_total: 3 }, { tipo: "multas", descricao: null, valor: 100 },
    ] });
    expect(linhas.map(d => [d.tipo, d.val])).toEqual([["adiantamento", 140], ["multas", 100]]);
    expect(linhas.reduce((s, d) => s + d.val, 0)).toBe(240);
  });
  it("dados antigos sem detalhamento não inventam INSS ou IRRF", () => {
    expect(descontosRecibo(item).map(d => [d.tipo, d.val])).toEqual([["outros", 100]]);
  });
});