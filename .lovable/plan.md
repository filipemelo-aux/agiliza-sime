# Menu "Notas Fiscais"

Novo grupo no menu lateral, **Notas Fiscais**, com dois submenus.

## 1. Consulta de Notas Fiscais
- Card **Filtrar** (recolhido): Período à esquerda e Empresa/estabelecimento à direita na primeira linha. Abaixo: **Tipo de ator** (Destinatário = notas de entrada / Transportadora), busca por emitente, CNPJ, número ou chave, e situação (autorizada/cancelada).
- Ao filtrar, o sistema consulta na SEFAZ as notas emitidas contra o CNPJ da empresa e mostra a lista: número, série, emissão, emitente, CNPJ, valor, chave, ator e situação. As linhas são coloridas pela situação e há uma legenda no rodapé.
- As notas já consultadas ficam guardadas no sistema. Assim, as consultas seguintes não repetem chamadas e mostram se a nota já virou despesa ou CT-e.
- Toolbar (só ícones):
  - **Gerar despesa** (disponível só para notas de Destinatário): abre o formulário de Nova Despesa já preenchido com o XML, igual ao "Importar XML" do Contas a Pagar.
  - **Emitir CT-e** (disponível só para notas de Transportadora): abre a emissão de CT-e com a nota já importada, como se a chave tivesse sido consultada lá.
  - **Baixar XML** das selecionadas, **Imprimir lista** e **Atualizar**.
  - Notas já usadas mostram um aviso, para não gerar despesa ou CT-e em duplicidade.

## 2. Download de XML
Tela no formato do print enviado:
- **Documentos** (escolha única): NF-e emissão própria, CT-e emissão própria, MDF-e emissão própria, Repositório CT-e – Conhecimentos Recebidos, Repositório NF-e – Notas Recebidas.
- **Data de emissão** (período) e Empresa.
- Botão de baixar na toolbar: gera um arquivo ZIP com todos os XMLs do período. As opções sem registros são avisadas.

## Detalhes técnicos
- Tabela `nfes_recebidas` com tenant_id, estabelecimento, chave (única por tenant), dados do resumo, ator (destinatario/transportadora), xml, expense_id e cte_id. A tabela segue o mesmo padrão de isolamento por empresa, com permissões e regras de acesso.
- A função `focus-nfe` já tem `nfes_recebidas` (consulta incremental por `versao`), `ctes_recebidas` e `nfe_por_chave`. Ela vai guardar a última versão consultada por estabelecimento e definir o ator comparando o CNPJ da empresa com o do destinatário ou da transportadora no XML.
- Gerar despesa: reaproveita `nfeXmlParser`/`FiscalDocImportDialog` → `ExpenseFormDialog` com dados iniciais e grava o `expense_id`.
- Emitir CT-e: abre `CteFormDialog` com o XML pré-carregado pelo mesmo caminho do `nfeImport`, inclusive com o bloqueio de chave duplicada.
- ZIP montado no navegador com os XMLs guardados de CT-e/MDF-e próprios e das notas e CT-es recebidos. "NF-e emissão própria" só lista registros se existir emissão de NF-e; hoje o sistema não emite NF-e, e a opção avisa isso.
- Consultor tem acesso somente de leitura (pode consultar e baixar, mas não gerar despesa nem CT-e).
