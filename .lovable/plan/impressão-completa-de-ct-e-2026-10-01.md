# Impressão completa de CT-e

## Objetivo
Substituir o comprovante resumido atual por um DACTE completo em A4 e usar exatamente o mesmo modelo para CT-es de Produção e de Serviço.

## Alterações
- Reestruturar a impressão com cabeçalho DACTE, identificação, chave/protocolo e indicação clara de documento sem valor fiscal quando não autorizado.
- Incluir emitente, remetente, expedidor, destinatário, recebedor e tomador, com documentos, IE, endereço e UF.
- Incluir prestação, tipo do CT-e/serviço, veículo, motorista, carga, quantidades, NF-es/outros documentos e documento anterior.
- Incluir composição do frete, ICMS, IBS/CBS, seguro, valores totais, observações e canhoto de recebimento.
- Manter impressão individual e em lote, com um CT-e por página e margens padrão do sistema.
- Aplicar o mesmo gerador aos talões de Serviço, exibindo os dados disponíveis e sem exigir autorização SEFAZ.

## Verificação
- Validar impressão de um CT-e de Produção e um de Serviço.
- Conferir A4 em tela pequena e desktop, quebra de página, campos longos e ausência de erros no aplicativo.

## Detalhes técnicos
- Centralizar o modelo compartilhado no gerador de impressão já usado pela toolbar.
- Normalizar estruturas JSON de notas, composição, quantidades, seguro e documentos antes de renderizar.
- Preservar a impressão via HTML leve e impressão nativa do navegador.
