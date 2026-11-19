import { describe, expect, it, vi } from "vitest";
import {
  capacidadePagina, montarPaginas, H_DEB, MARGIN_MM, OPCOES_PADRAO, temDebitos,
  type RelacaoLinha, type RelacaoOpcoes,
} from "./fleetRelacaoPdf";

vi.mock("@/lib/htmlToPdf", () => ({ downloadHtmlAsPdf: vi.fn(async () => {}) }));
vi.mock("@/lib/printHeader", () => ({
  fetchMatrizHeader: vi.fn(async () => ({ name: "Sime Transporte Ltda", docLine: "CNPJ 00.000.000/0001-00", address: "Av. Brasil, 1000" })),
  buildPrintHeaderHtml: () => "",
}));

const linha = (n: number, comDebito: boolean): RelacaoLinha => ({
  plate: `PTT${String(n).padStart(4, "0")}A`, veiculo: "SCANIA R 450 A6X2NA",
  renavam: "01234567890", chassi: "98PTT47MSLB110598",
  alienacao: comDebito ? "Alienado – BANCO BRADESCO S/A" : "Livre",
  situacao: comDebito ? "Vencido" : "Em dia",
  porAno: comDebito ? { 2026: 1543.12, 2025: 0 } : {},
  multas: comDebito ? 302.7 : 0, total: comDebito ? 1845.82 : 0,
});

const SEM_DEBITO: RelacaoOpcoes = { ...OPCOES_PADRAO, debitos: false };

describe("montarPaginas (A4 paisagem)", () => {
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
    const linhas = Array.from({ length: 8 }, (_, i) => linha(i, true));
    const com = montarPaginas(linhas, OPCOES_PADRAO);
    const sem = montarPaginas(linhas, SEM_DEBITO);
    expect(com.length).toBe(1); // com os totais ainda cabe na primeira página
    expect(sem.length).toBe(1);
    expect(com[0].altura - sem[0].altura).toBe(8 * H_DEB);
  });
});

describe("orientação do papel", () => {
  it("baixa a relação em A4 paisagem", async () => {
    const { exportFleetRelacaoPdf } = await import("./fleetRelacaoPdf");
    const { downloadHtmlAsPdf } = await import("@/lib/htmlToPdf");
    const linha: RelacaoLinha = {
      plate: "PTT9D20", veiculo: "SCANIA R 450 A6X2NA", renavam: "01234567890", chassi: "98PTT47MSLB110598",
      alienacao: "Livre", situacao: "Em dia", porAno: {}, multas: 0, total: 0,
    };
    await exportFleetRelacaoPdf([linha], [2026], OPCOES_PADRAO);
    expect(downloadHtmlAsPdf).toHaveBeenCalledTimes(1);
    const opts = (downloadHtmlAsPdf as unknown as { mock: { calls: [string, string, { orientation: string; marginMm: number }][] } }).mock.calls[0][2];
    expect(opts.orientation).toBe("landscape");
    expect(opts.marginMm).toBe(MARGIN_MM);
  });
});

import { agruparConjuntos as _ag } from "./fleetRelacaoPdf";
describe("agruparConjuntos", () => {
  const L = (plate: string) => ({ plate, veiculo: "", renavam: "", chassi: "", alienacao: "", situacao: "", porAno: {}, multas: 0, total: 0 });
  it("junta placas vinculadas direta ou indiretamente, tração primeiro", () => {
    const r = _ag([L("ZZZ1A11"), L("AAA1A11"), L("BBB1B11"), L("CCC1C11")], [["CCC1C11", "AAA1A11"], ["CCC1C11", "BBB1B11"]], new Set(["CCC1C11"]));
    expect(r.map((l) => l.plate)).toEqual(["CCC1C11", "AAA1A11", "BBB1B11", "ZZZ1A11"]);
  });
  it("cavalos vêm antes de implementos avulsos", () => {
    const r = _ag([L("AAA0A00"), L("ZZZ9Z99")], [], new Set(["ZZZ9Z99"]));
    expect(r.map((l) => l.plate)).toEqual(["ZZZ9Z99", "AAA0A00"]);

  });
});

describe("placas avulsas", () => {
  const L = (plate: string) => ({ plate, veiculo: "", renavam: "", chassi: "", alienacao: "", situacao: "", porAno: {}, multas: 0, total: 0 });
  it("ficam depois de todos os conjuntos e sem rótulo de conjunto", () => {
    const r = _ag([L("AAA0A00"), L("BBB0B00"), L("ZZZ9Z99"), L("YYY9Y99")], [["ZZZ9Z99", "YYY9Y99"]], new Set(["ZZZ9Z99", "AAA0A00"]));
    expect(r.map((l) => l.plate)).toEqual(["ZZZ9Z99", "YYY9Y99", "AAA0A00", "BBB0B00"]);
    expect(r.slice(2).every((l) => !l.conjunto)).toBe(true);
  });
});
