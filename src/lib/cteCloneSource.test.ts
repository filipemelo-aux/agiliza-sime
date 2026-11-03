import { describe, expect, it } from "vitest";
import { resolveCloneSource } from "./cteCloneSource";

const rows = [
  { id: "p1", numero: 8819, tipo_talao: "producao" },
  { id: "s1", numero_interno: 13824, tipo_talao: "servico" },
  { id: "s2", numero_interno: 13825, tipo_talao: "servico" },
];

describe("resolveCloneSource", () => {
  it("não clona nada sem seleção", () => {
    expect(resolveCloneSource(rows, new Set())).toBeNull();
  });

  it("clona um CT-e de serviço selecionado sozinho", () => {
    const src = resolveCloneSource(rows, new Set(["s1"]));
    expect(src?.id).toBe("s1");
    expect(src?.tipo_talao).toBe("servico");
  });

  it("clona um CT-e de produção selecionado sozinho", () => {
    expect(resolveCloneSource(rows, new Set(["p1"]))?.id).toBe("p1");
  });

  it("com dois selecionados de talões diferentes não clona nada", () => {
    expect(resolveCloneSource(rows, new Set(["p1", "s2"]))).toBeNull();
  });

  it("com dois selecionados do mesmo talão não clona nada", () => {
    expect(resolveCloneSource(rows, new Set(["s1", "s2"]))).toBeNull();
  });

  it("com todos selecionados não clona nada", () => {
    expect(resolveCloneSource(rows, new Set(["p1", "s1", "s2"]))).toBeNull();
  });
});
