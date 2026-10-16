import { describe, expect, it } from "vitest";
import { fiscalProtocolNumber } from "./fiscalProtocol";

describe("fiscalProtocolNumber", () => {
  it("extrai o número do retorno Focus", () => {
    expect(fiscalProtocolNumber(JSON.stringify({ versao: "4.00", protocolo: "317260007573001", status: "100", digest_value: "abc" }))).toBe("317260007573001");
  });
  it("preserva o número simples", () => {
    expect(fiscalProtocolNumber("317260007573001")).toBe("317260007573001");
  });
  it("extrai objetos e XML", () => {
    expect(fiscalProtocolNumber({ protCTe: { infProt: { nProt: "317260007573001" } } })).toBe("317260007573001");
    expect(fiscalProtocolNumber('<protCTe><infProt><nProt>317260007573001</nProt></infProt></protCTe>')).toBe("317260007573001");
  });
  it("não exibe retorno sem protocolo", () => {
    expect(fiscalProtocolNumber('{"status":"rejeitado","mensagem":"falha"}')).toBe("");
  });
});