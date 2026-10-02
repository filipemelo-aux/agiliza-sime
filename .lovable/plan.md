# Impressões fiscais em caixa alta e DACTE fiel ao modelo

## Resultado
- Reproduzir no DACTE a estrutura visual do PDF oficial enviado: proporções, divisórias, alturas, colunas, campos, canhoto, cabeçalho, código de barras e QR Code.
- Aplicar o mesmo DACTE aos CT-es de Produção e Serviço, preservando a indicação de documento interno quando não houver autorização fiscal.
- Exibir em caixa alta todos os textos e dados impressos no CT-e e no MDF-e.
- Disponibilizar a impressão do MDF-e em PDF com organização fiscal compacta e dados do manifesto selecionado.

## Ajustes do DACTE
- Refazer a grade com medidas fixas em milímetros para manter o desenho do modelo em A4.
- Reposicionar o cabeçalho: emitente à esquerda, identificação do DACTE ao centro e QR Code à direita.
- Igualar os quadros de tipo, globalização, CFOP, origem/destino, envolvidos, tomador, carga, componentes, impostos, documentos, observações, modal, uso exclusivo e canhoto.
- Centralizar horizontal e verticalmente somente os campos centralizados no modelo; preservar textos corridos e endereços alinhados à esquerda.
- Usar a logomarca cadastrada e ajustar fontes/alturas sem sobreposição ou corte.

## Impressão do MDF-e
- Criar o DAMDFE em A4 com emitente, identificação, chave/protocolo, percurso, municípios, CT-es, carga, veículo, condutores, seguro, CIOT, vale-pedágio e observações.
- Adicionar a ação de baixar o PDF do MDF-e selecionado na listagem.

## Validação
- Gerar o DACTE do CT-e 8785 e comparar visualmente com o PDF enviado.
- Gerar um PDF de MDF-e com dados existentes.
- Conferir caixa alta, limites da página, linhas, campos longos e ausência de erros.

## Detalhes técnicos
- Manter uma única estrutura de DACTE compartilhada entre Produção e Serviço.
- Aplicar caixa alta no documento renderizado, sem alterar os dados salvos.
- Continuar usando o download direto em PDF existente, sem abrir nova janela.
