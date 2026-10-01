# CT-e de Produção — nova ordem da tela

## Respostas às dúvidas

- **Envio:** é a cidade onde o CT-e é emitido. A SEFAZ exige esse dado, mas ele é sempre a cidade do emitente. Vai sair da tela e ser preenchido sozinho.
- **Carga cadastrada:** sim, está repetida. Vai sair.
- **Quantidades (infQ):** a SEFAZ exige pelo menos uma medida da carga (peso em kg, unidades, m³). Vai ser preenchida sozinha com o peso e a quantidade das notas e não aparece mais na tela.
- **Componentes do frete:** é a lista que a SEFAZ recebe com a composição do valor (frete, pedágio, seguro...). Vai ser substituída pelo novo quadro "Composição do Frete", que gera essa lista sozinho.
- **Retira:** informa se o destinatário busca a carga no terminal da transportadora. Na lotação rodoviária é sempre **Não**, que passa a ser o padrão.
- **Pedágio, diária, seguro e outros:** na regra do CT-e eles **somam** ao total da prestação, não descontam. Descontos (como o desconto interno) só reduzem o **valor a receber**. A tela vai mostrar as duas linhas separadas: Total da Prestação e Total a Receber.

## Nova ordem dos blocos

1. **Emitente e tipo do documento:** emitente, data, tipo de CT-e, tipo de serviço, modal (fixo em Rodoviário) e Retira (padrão Não).
2. **Opção "Gerar manifesto (MDF-e)":** se marcada, depois de salvar o CT-e abre a tela de MDF-e já preenchida.
3. **Importar nota fiscal:** XML, chave da SEFAZ ou busca pela consulta de notas. Preenche envolvidos, cidades, peso, valor, produto e os documentos.
4. **Envolvidos:** remetente, destinatário, expedidor, recebedor e tomador.
5. **Motorista e veículo:** escolher o motorista preenche caminhão, carretas e proprietário. Escolher a placa preenche motorista e proprietário.
6. **Seguro da carga.**
7. **Documentos:** seletor **NF-e** (marcado por padrão) ou **Outros**.
   - NF-e: chave, natureza, data, tipo, número, série, peso, quantidade, espécie, cubagem, marca, CFOP, valor dos produtos, BC ICMS, BC ICMS ST, outros, valor do documento e NCM, tudo vindo da importação.
   - Outros: os mesmos campos, digitados à mão, com "Descrição" no lugar da chave.
8. **Frete mínimo ANTT:** tabela, pago retorno, tipo de carga e número de eixos. A distância é calculada sozinha a partir das cidades de origem e destino, e o resultado é o frete mínimo, com aviso se o frete ficar abaixo dele.
9. **Composição do frete:** uma regra padrão, tarifa final, tarifa real, frete valor, base de cálculo, alíquota, valor do ICMS, outros, pedágio, diária, seguro, total do serviço, total da prestação e total a receber.
10. **Impostos IBS e CBS.**
11. **Opção "Gerar previsão de recebimento"** (marcada por padrão).
12. **Opção "Gerar contrato de frete".**

Itens que saem da tela: Envio, Carga cadastrada, Quantidades (infQ) e Componentes do frete (todos passam a ser automáticos). Observações continuam num bloco recolhido no final.

## Detalhes técnicos

- Reescrever a ordem dos FormBlocks em `CteFormDialog.tsx`. Os campos internos continuam (`municipio_envio_*`, `infQ`, `componentes`) e são derivados no salvamento.
- Ampliar o parser de NF-e (XML e Focus) para extrair CFOP, NCM, BC ICMS/ST, marca, quantidade, cubagem e valor dos produtos por nota.
- Busca reversa placa → motorista via `vehicles.driver_id` e proprietário do veículo.
- ANTT: guardar os coeficientes da Resolução 5.867/2020 (CCD e CC por tipo de carga e eixos, tabelas A–D) numa constante versionada, com a data da portaria vigente. Fórmula: distância × CCD + CC, acrescida do retorno vazio quando marcado. Distância por uma função de backend que consulta um serviço público de rotas (OSRM) com as coordenadas das cidades.
- Flag de previsão: hoje um gatilho no banco cria a previsão para todo CT-e. Criar uma coluna `gerar_previsao boolean default true` e fazer o gatilho respeitá-la.
- Flag de MDF-e: após salvar, navegar para a tela de MDF-e com o CT-e já selecionado.
- Talão de Serviço não é alterado.
