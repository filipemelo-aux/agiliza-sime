# Padronização global: Data Grid + Toolbar Fixa

Objetivo: eliminar cards e ações inline, padronizando todos os módulos em tabela densa com uma barra de ferramentas fixa cujos botões acendem/apagam conforme a seleção.

## Peças base (feitas primeiro, reutilizadas em tudo)

1. `GlobalToolbar` — barra fixa acima da tabela. Recebe uma lista de ações (`label`, ícone, variante, `mode: "always" | "single" | "batch" | "single+batch"`) e a contagem de selecionados; calcula sozinha o estado habilitado/desabilitado:
   - 0 selecionados: só "Novo" ativo, restante visível e apagado.
   - 1 selecionado: ações individuais e de lote acesas.
   - 2+: só ações de lote acesas.
2. `DataGrid` — tabela densa padronizada no visual já usado na edição de fatura de cartão: cabeçalho fixo, linhas `h-8`, `text-xs`, checkbox na extrema esquerda, clique em qualquer parte da linha seleciona, ordenação por coluna, rodapé com totais e contagem.

Sem coluna de "Ações" em nenhuma tabela; abrir detalhe/editar passa a ser feito pelo botão da toolbar com 1 linha selecionada.

## Módulos convertidos (nesta ordem)

- **Contas a Pagar** — remove cards e a barra flutuante de lote; toolbar: Novo, Editar, Detalhes, Pagar, Estornar, Excluir, Imprimir/Exportar.
- **Contas Pagas** — remove cards; toolbar: Detalhes, Estornar, Recibo, Imprimir/Exportar.
- **Cartão de Crédito** — a lista de faturas vira grid; toolbar: Nova Fatura, Editar, Imprimir, Excluir.
- **Faturamento** — grid único; toolbar: Nova, Editar, Receber, Estornar, Excluir em lote, Imprimir.
- **CT-e (produção e serviço)** — grid; toolbar: Novo, Editar, Detalhes, Transmitir, Cancelar, Imprimir/DACTE.
- **Contratos de Frete** — grid; toolbar: Novo, Editar, Detalhes, Imprimir, Excluir.
- **Demais listagens com cards ou ações inline** (Abastecimentos, Ordens de Abastecimento, Manutenções, Cotações, Colheita, Veículos, Pessoas, Cargas, MDF-e): mesma conversão, com as ações específicas de cada tela na toolbar.

## Detalhes técnicos

- Regras de negócio, queries e permissões permanecem inalteradas — muda apenas apresentação e o ponto de disparo das ações (linha → toolbar).
- Ações que hoje só funcionam para um item ganham execução em lote onde faz sentido (excluir, pagar, estornar), reaproveitando os diálogos existentes em loop com confirmação única.
- Botões respeitam o padrão atual (h-9/h-10, ícone + rótulo) e desabilitam via `disabled`, sem sumir da tela.
- No mobile a tabela mantém rolagem horizontal (`overflow-x-auto`) em vez de voltar para cards; a toolbar quebra em linhas.

## Entrega

Por ser uma mudança ampla, entrego em blocos verificáveis: primeiro os componentes base + Contas a Pagar / Contas Pagas / Cartão de Crédito, depois Faturamento / Fiscal / Contratos, depois as listagens operacionais restantes.
