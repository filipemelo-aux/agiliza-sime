import { describe, expect, it } from "vitest";
import { chavePixResumoFolha, formatarChavePix, totalizarResumoFolha, type ResumoFolhaLinha } from "./resumoFolha";

const linha = (valores: Partial<ResumoFolhaLinha>): ResumoFolhaLinha => ({ nome: "", tipo: "", inicio: "", fim: "", vencimento: "", situacao: "", base: 0, comissoes: 0, reembolsos: 0, adiantamentos: 0, descontos: 0, liquido: 0, ...valores });

describe("Resumo consolidado dos fechamentos", () => {
  it("inclui a chave Pix cadastral de colaboradores com folha a pagar", () => {
    for (const situacao of ["em_aberto", "confirmada", "parcial"]) {
      expect(chavePixResumoFolha(" colaborador@example.com ", false, situacao)).toEqual({ valor: "colaborador@example.com", tipo: "E-mail" });
    }
  });
  it("não inclui chave Pix de itens pagos ou folhas canceladas", () => {
    expect(chavePixResumoFolha("colaborador@example.com", true, "parcial")).toBeUndefined();
    expect(chavePixResumoFolha("colaborador@example.com", false, "paga")).toBeUndefined();
    expect(chavePixResumoFolha("colaborador@example.com", false, "cancelada")).toBeUndefined();
  });
  it("não inventa chave Pix quando o cadastro não possui uma", () => {
    expect(chavePixResumoFolha(null, false, "em_aberto")).toBeUndefined();
    expect(chavePixResumoFolha("  ", false, "em_aberto")).toBeUndefined();
  });
  it("limpa a chave Pix de espaços, traços e pontos e identifica o tipo", () => {
    expect(formatarChavePix("123.456.789-01")).toEqual({ valor: "12345678901", tipo: "CPF" });
    expect(formatarChavePix("(63) 99984-1234")).toEqual({ valor: "63999841234", tipo: "Celular" });
    expect(formatarChavePix("63 98412-341")).toEqual({ valor: "6398412341", tipo: "CPF" });
    expect(formatarChavePix("12.345.678/0001-90")).toEqual({ valor: "12345678000190", tipo: "CNPJ" });
    expect(formatarChavePix(" filipe@exemplo.com ")).toEqual({ valor: "filipe@exemplo.com", tipo: "E-mail" });
  });
  it("inclui o reembolso do Jailan uma vez e preserva o saldo fechado sem salário cadastral", () => {
    expect(totalizarResumoFolha([
      linha({ nome: "Jailan", comissoes: 2174.36, reembolsos: 60, adiantamentos: 590, liquido: 1644.36 }),
      linha({ nome: "Geziel", comissoes: 1962.05, adiantamentos: 740, liquido: 1222.05 }),
    ])).toEqual({ base: 0, comissoes: 4136.41, reembolsos: 60, adiantamentos: 1330, descontos: 0, liquido: 2866.41 });
  });
  it("reúne administrativos e motoristas usando o líquido gravado de todos os fechamentos", () => {
    expect(totalizarResumoFolha([
      linha({ tipo: "Folha administrativa", base: 2000, reembolsos: 100, descontos: 200, liquido: 1900 }),
      linha({ tipo: "Acerto motorista", comissoes: 500, adiantamentos: 100, liquido: 400 }),
    ])).toEqual({ base: 2000, comissoes: 500, reembolsos: 100, adiantamentos: 100, descontos: 200, liquido: 2300 });
  });
});