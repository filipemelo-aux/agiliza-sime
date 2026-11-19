import {extrairAlienacao} from "./alienacao";
import {test,expect} from "vitest";
test("impedimentos",()=>{expect(extrairAlienacao({impedimentos:"AlienaÃ§Ã£o FiduciÃ¡ria em favor de BCO NORDESTE DO BRASIL (CNPJ:07.237.373/0001-20)",informacao_gravame:"Nenhuma informaÃ§Ã£o pendente"})).toEqual({status:"alienado",texto:"BCO NORDESTE DO BRASIL"})});
