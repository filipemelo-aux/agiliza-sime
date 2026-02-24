# Schemas XSD para Documentos Fiscais

Este diretório deve conter os schemas XSD oficiais da SEFAZ para validação formal dos XMLs.

## Arquivos esperados

| Arquivo | Descrição | Download |
|---|---|---|
| `cte_v4.00.xsd` | Schema principal CT-e 4.00 | [Portal CT-e](https://www.cte.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=Qk/TGzfnsg8=) |
| `cteModalRodoviario_v4.00.xsd` | Modal rodoviário | Incluído no pacote CT-e |
| `tiposBasico_v4.00.xsd` | Tipos básicos | Incluído no pacote CT-e |
| `tiposGeralCTe_v4.00.xsd` | Tipos gerais CT-e | Incluído no pacote CT-e |
| `enviCTe_v4.00.xsd` | Envelope de envio | Incluído no pacote CT-e |
| `mdfe_v3.00.xsd` | Schema principal MDF-e 3.00 | [Portal MDF-e](https://dfe-portal.svrs.rs.gov.br/Mdfe/Documentos) |

## Como obter

1. Acesse o Portal do CT-e ou MDF-e
2. Baixe o pacote de schemas (PL_CTe_400 / PL_MDFe_300)
3. Extraia os `.xsd` neste diretório
4. Rebuild o Docker: `docker build -t fiscal-service ./xml-signer`

## Comportamento sem XSD

Se os schemas não estiverem presentes, o microserviço **não bloqueia** a emissão.
A validação é ignorada graciosamente (skip), e um warning é logado.
O endpoint `/health` reporta `xsd_available: false`.
