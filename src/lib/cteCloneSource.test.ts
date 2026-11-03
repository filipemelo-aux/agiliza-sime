import { describe, expect, it } from "vitest";
import { resolveCloneSource } from "./cteCloneSource";

const rows = [
  { id: "p1", numero: 8819, tipo_talao: "producao" },
  { id: "s1", numero_interno: 13824, tipo_talao: "servico" },
  { id: "s2", numero_interno: 13825, tipo_talao: "servico" },
];

describe("resolveCloneSource", () => {
  it("não clona nada sem seleção", () => {
    expect(resolveCloneSource(rows, new Set(), null)).toBeNull();
  });

  it("clona um CT-e de serviço selecionado sozinho", () => {
    const src = resolveCloneSource(rows, new Set(["s1"]), "s1");
    expect(src?.id).toBe("s1");
    expect(src?.tipo_talao).toBe("servico");
  });

  it("clona um CT-e de produção selecionado sozinho", () => {
    expect(resolveCloneSource(rows, new Set(["p1"]), "p1")?.id).toBe("p1");
  });

  it("com vários selecionados copia o último clicado", () => {
    expect(resolveCloneSource(rows, new Set(["p1", "s2"]), "s2")?.id).toBe("s2");
    expect(resolveCloneSource(rows, new Set(["p1", "s2"]), "p1")?.id).toBe("p1");
  });

  it("usa a última linha visível quando o clicado já saiu da lista", () => {
    expect(resolveCloneSource(rows, new Set(["p1", "s1"]), "fora")?.id).toBe("s1");
  });
});
