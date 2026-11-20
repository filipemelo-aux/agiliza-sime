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
  it("soma 2024 para trás numa linha só, chamada Anos anteriores", () => {
    const c = [L("AAA1A11", true, { 2026: 1000, 2024: 400, 2022: 100 }, { 2023: 50 }, { 2024: 20 })];
    const html = montarHtmlRelacao(c, [2026, 2025], { ...OPCOES_PADRAO, resumo: true }, company);
    expect(html).not.toMatch(/<td>2024<\/td>/);
    expect(html).not.toMatch(/<td>2022<\/td>/);
    expect(html).not.toMatch(/<td>2023<\/td>/);
    expect(html).toMatch(/<td>Anos anteriores<\/td><td class="num">R\$\s500,00<\/td><td class="num">R\$\s50,00<\/td><td class="num">R\$\s20,00<\/td><td class="num">R\$\s570,00<\/td>/);
    // O ano com coluna própria continua saindo separado.
    expect(html).toMatch(/<td>2026<\/td><td class="num">R\$\s1\.000,00<\/td>/);
  });
  it("não cria a linha Anos anteriores quando só há os anos das colunas", () => {
    const html = montarHtmlRelacao(linhas, [2026, 2025], { ...OPCOES_PADRAO, resumo: true }, company);
    expect(html).not.toContain("Anos anteriores");
  });
});
