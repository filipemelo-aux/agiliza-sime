import { describe, expect, it } from "vitest";
import {
  capacidadePagina, montarPaginas, H_DEB, OPCOES_PADRAO, temDebitos,
  type RelacaoLinha, type RelacaoOpcoes,
} from "./fleetRelacaoPdf";

const linha = (n: number, comDebito: boolean): RelacaoLinha => ({
  plate: `PTT${String(n).padStart(4, "0")}A`, veiculo: "SCANIA R 450 A6X2NA",
  renavam: "01234567890", chassi: "98PTT47MSLB110598",
  alienacao: comDebito ? "Alienado – BANCO BRADESCO S/A" : "Livre",
  situacao: comDebito ? "Vencido" : "Em dia",
  porAno: comDebito ? { 2026: 1543.12, 2025: 0 } : {},
  multas: comDebito ? 302.7 : 0, total: comDebito ? 1845.82 : 0,
});

const SEM_DEBITO: RelacaoOpcoes = { ...OPCOES_PADRAO, debitos: false };

describe("montarPaginas (A4 retrato)", () => {
  it("mantém todos os veículos uma única vez e pagina quando não cabe", () => {
    const linhas = Array.from({ length: 40 }, (_, i) => linha(i, true));
    const pages = montarPaginas(linhas, OPCOES_PADRAO);
    expect(pages.length).toBeGreaterThan(1);
    const placas = pages.flatMap((p) => p.linhas.map((l) => l.plate));
    expect(placas.sort()).toEqual(linhas.map((l) => l.plate).sort());
    expect(new Set(placas).size).toBe(40);
  });

  it("nenhuma página excede a altura útil do papel", () => {
    const linhas = Array.from({ length: 40 }, (_, i) => linha(i, true));
    const pages = montarPaginas(linhas, OPCOES_PADRAO);
    pages.forEach((p, i) => {
      expect(p.altura).toBeLessThanOrEqual(capacidadePagina(i));
    });
  });

  it("veículo sem débitos ocupa uma linha só (mais compacto que com débitos)", () => {
    const base: RelacaoLinha = {
      plate: "PTT0001A", veiculo: "SCANIA R 450", renavam: "01234567890", chassi: "98PTT47MSLB110598",
      alienacao: "Livre", situacao: "Em dia", porAno: {}, multas: 0, total: 0,
    };
    const comDebito: RelacaoLinha = { ...base, situacao: "Vencido", porAno: { 2026: 1543.12 }, multas: 302.7, total: 1845.82 };
    expect(temDebitos(comDebito, OPCOES_PADRAO)).toBe(true);
    expect(temDebitos(base, OPCOES_PADRAO)).toBe(false);
    const comPag = montarPaginas([comDebito], OPCOES_PADRAO);
    const semPag = montarPaginas([base], OPCOES_PADRAO);
    expect(comPag[0].altura - semPag[0].altura).toBe(H_DEB);
  });

  it("sem a opção de documentos atrasados, cada veículo perde a linha de débitos", () => {
    const linhas = Array.from({ length: 10 }, (_, i) => linha(i, true));
    const com = montarPaginas(linhas, OPCOES_PADRAO);
    const sem = montarPaginas(linhas, SEM_DEBITO);
    expect(com.length).toBe(1); // com os totais ainda cabe na primeira página
    expect(sem.length).toBe(1);
    expect(com[0].altura - sem[0].altura).toBe(10 * H_DEB);
  });
});
