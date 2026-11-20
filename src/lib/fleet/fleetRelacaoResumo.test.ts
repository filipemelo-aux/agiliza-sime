import { describe, it, expect } from "vitest";
import { montarHtmlRelacao, OPCOES_PADRAO, type RelacaoLinha } from "./fleetRelacaoPdf";

const L = (plate: string, cavalo: boolean, ipva: Record<number, number>, lic: Record<number, number>, mul: Record<number, number>): RelacaoLinha => ({
  plate, veiculo: "", renavam: "", chassi: "", alienacao: "", situacao: "Vencido", porAno: {}, multas: 0, total: 1, cavalo,
  ipvaPorAnoTodos: ipva, licPorAno: lic, multasPorAno: mul,
});
const company = { name: "X", docLine: "", address: "" };

describe("resumo da relação", () => {
  const linhas = [L("AAA1A11", true, { 2026: 1000 }, { 2026: 100 }, { 2025: 50 }), L("BBB1B11", true, { 2026: 500 }, {}, {}), L("CCC1C11", false, {}, { 2025: 80 }, {})];
  it("soma IPVA dos cavalos por ano e separa os demais", () => {
    const html = montarHtmlRelacao(linhas, [2026, 2025], { ...OPCOES_PADRAO, resumo: true }, company);
    expect(html).toContain("Cavalos · 2 veículo(s)");
    expect(html).toContain("Demais veículos (reboques, semirreboques e dollys) · 1 veículo(s)");
    expect(html).toMatch(/<td>2026<\/td><td class="num">R\$\s1\.500,00<\/td><td class="num">R\$\s100,00/);
  });
  it("sem a opção não gera resumo", () => {
    expect(montarHtmlRelacao(linhas, [2026], OPCOES_PADRAO, company)).not.toContain("Cavalos ·");
  });
});
