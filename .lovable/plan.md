# Corrigir transmissão do CT-e

## Objetivo
Deixar a emissão fiscal disponível somente na barra de ações da listagem e trocar o caminho que falhou pelo conector Focus NFe já validado.

## Alterações
- Remover os botões de transmitir das janelas de criação, edição e detalhes.
- Adicionar **Emitir SEFAZ** à barra da listagem; habilitar somente com um único CT-e de produção em rascunho ou rejeitado selecionado.
- Pedir confirmação, preparar e validar os dados, enviar pela Focus NFe em homologação e atualizar status, chave, protocolo, motivo e links retornados.
- Traduzir erros técnicos em mensagens claras sem fechar nem perder o CT-e.

## Validação
- Conferir os estados habilitado/desabilitado da barra.
- Testar a transmissão do CT-e selecionado e confirmar a atualização da linha.
- Verificar que as janelas não exibem mais ações de transmissão.
