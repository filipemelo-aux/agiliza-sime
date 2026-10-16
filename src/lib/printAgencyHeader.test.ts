import { describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: query }) } }));
vi.mock("@/lib/tenantLogo", () => ({ getCurrentTenantLogoUrl: vi.fn().mockResolvedValue(null) }));
import { buildPrintAgencyHeader, selectPrintAgency, standardizePrintHeaders } from "./printAgencyHeader";

const agencies = [
  { id: "matriz", type: "matriz", razao_social: "Empresa Matriz", cnpj: "23662751000179", endereco_uf: "MA" },
  { id: "filial", type: "filial", razao_social: "Empresa Filial", cnpj: "23662751000250", endereco_municipio: "Araguaína", endereco_uf: "TO", inscricao_estadual: "123", endereco_cep: "77800000" },
];
describe("Cabeçalho da agência", () => {
  it("prioriza a agência explícita mesmo com CNPJ antigo no HTML", () => {
    expect(selectPrintAgency(agencies, "filial", agencies[0].cnpj)?.id).toBe("filial");
  });
  it("não troca uma agência inexistente pela matriz", () => {
    expect(selectPrintAgency(agencies, "ausente")).toBeUndefined();
  });
  it("reconhece CNPJ formatado e usa matriz só em relatório consolidado", () => {
    expect(selectPrintAgency(agencies, null, "23.662.751/0002-50")?.id).toBe("filial");
    expect(selectPrintAgency(agencies)?.id).toBe("matriz");
  });
  it("mostra somente dados da filial, sem marca do sistema", () => {
    const html = buildPrintAgencyHeader(agencies[1], null);
    expect(html).toContain("ARAGUAÍNA - TO");
    expect(html).toContain("23.662.751/0002-50");
    expect(html).toContain("IE: 123");
    expect(html).not.toContain("EMPRESA MATRIZ");
    expect(html).not.toContain("Agiliza");
  });
  it("escapa dados cadastrais", () => {
    expect(buildPrintAgencyHeader({ razao_social: '<script>alert("x")</script>' }, null)).not.toContain("<script>");
  });
  it("preserva título, total e corpo da fatura ao trocar a agência", async () => {
    query.mockResolvedValue({ data: agencies, error: null });
    const result = await standardizePrintHeaders('<html><body><div class="header"><div>CNPJ: 23.662.751/0001-79</div><div class="doc-info">Fatura #42 — R$ 500,00</div></div><table><tr><td>Item original</td></tr></table></body></html>', "filial");
    expect(result).toContain("23.662.751/0002-50");
    expect(result).not.toContain("23.662.751/0001-79");
    expect(result).toContain("Fatura #42 — R$ 500,00");
    expect(result).toContain("Item original");
  });
  it("mantém a agência própria de cada contrato em lote", async () => {
    query.mockResolvedValue({ data: agencies, error: null });
    const result = await standardizePrintHeaders('<html><body><div class="header" data-print-agency="matriz"><div class="num">Contrato 1</div></div><div class="header" data-print-agency="filial"><div class="num">Contrato 2</div></div></body></html>');
    const doc = new DOMParser().parseFromString(result, "text/html");
    const headers = doc.querySelectorAll(".header");
    expect(headers[0].textContent).toContain("EMPRESA MATRIZ");
    expect(headers[1].textContent).toContain("EMPRESA FILIAL");
    expect(headers[1].textContent).toContain("Contrato 2");
  });
});