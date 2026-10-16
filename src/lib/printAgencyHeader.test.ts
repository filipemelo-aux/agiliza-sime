import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/tenantLogo", () => ({ getCurrentTenantLogoUrl: vi.fn() }));
import { buildPrintAgencyHeader, selectPrintAgency } from "./printAgencyHeader";

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
});