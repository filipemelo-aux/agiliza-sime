# Padronização global de buscas e filtros

## Objetivo
Separar claramente pesquisa e filtragem das ações operacionais em todas as páginas do ERP.

## Implementação
1. Criar um cartão reutilizável de busca e filtros, compacto e responsivo, usando os componentes e tokens visuais já existentes.
2. Restringir a toolbar global a ações por ícone, removendo dela campos de busca, períodos, empresas, status, ordenação e outros filtros.
3. Substituir blocos avulsos de filtros pelo novo cartão nas páginas de cadastros, financeiro, transporte, RH e relatórios.
4. Manter resumos antes dos filtros e preservar integralmente regras, valores e comportamentos atuais.
5. Conferir páginas representativas e corrigir qualquer quebra visual ou de compilação.

## Detalhes técnicos
- O novo componente aceitará título opcional, conteúdo flexível, ação de limpar e áreas responsivas.
- Tooltips informativos e totais de seleção continuam na toolbar quando forem ações ou estados, não filtros.
- Filtros internos de diálogos e formulários não serão alterados, pois não são filtros de página.
