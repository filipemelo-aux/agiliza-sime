import {extrairAlienacao} from "./alienacao";
import {test,expect} from "vitest";
test("impedimentos",()=>{expect(extrairAlienacao({impedimentos:"AlienaÃ§Ã£o FiduciÃ¡ria em favor de BCO NORDESTE DO BRASIL (CNPJ:07.237.373/0001-20)",informacao_gravame:"Nenhuma informaÃ§Ã£o pendente"})).toEqual({status:"alienado",texto:"BCO NORDESTE DO BRASIL"})});

import { extrairAlienacao as ex2 } from "./alienacao";
describe("intenção de venda", () => {
  it("registra intenção de venda com comprador", () => {
    expect(ex2({ data: [{ impedimentos: "Intenção de venda para FELIPE S MELO registrada em 29/10/2024" }] })).toEqual({ status: "intencao_venda", texto: "FELIPE S MELO" });
  });
  it("registra intenção de venda sem comprador", () => {
    expect(ex2({ impedimentos: "INTENCAO VENDA" })?.status).toBe("intencao_venda");
  });
});
