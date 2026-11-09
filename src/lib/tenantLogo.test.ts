import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { tenantLogoFrom } from "./tenantLogo";

describe("marca global no portal", () => {
  it("usa a logomarca do cadastro de qualquer empresa", () => {
    expect(tenantLogoFrom("https://example.com/sime.png")).toBe("https://example.com/sime.png");
    expect(tenantLogoFrom("https://example.com/outra-empresa.png")).toBe("https://example.com/outra-empresa.png");
    expect(tenantLogoFrom("data:image/png;base64,imagem")).toBe("data:image/png;base64,imagem");
  });
  it("não atribui a marca da Sime a empresa sem logo cadastrada", () => {
    expect(tenantLogoFrom(null)).toBeNull();
    expect(tenantLogoFrom(undefined)).toBeNull();
  });
});