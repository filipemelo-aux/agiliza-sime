# Roadmap

- [x] Cadastro universal por placa: categorias individuais e proprietário preservados; 43 implementos separados dos conjuntos existentes; cadastro de placa antiga e Mercosul gravado e conferido na tela.
- [x] Cadastros > Vinculações: montagem/desengate com motorista real e histórico conferidos; proteção de simultaneidade e categoria vinculada validada no banco.
- [x] Integrar vínculos aos fluxos fiscais/operacionais: projeção transacional dos campos legados, preenchimento fiscal e exclusão de implementos dos abastecimentos; 15 testes aprovados, registros temporários removidos e compilação válida.

- [x] Revisar acessos Moderador/Operador: corrigidos carregamentos, numeração fiscal, recebimentos, agrupamentos e funções fiscais; novo operador conferido em Pessoas, Veículos, Financeiro, CT-e, MDF-e e Conciliação; testes reais de gravação/edição/agrupamento/exclusão aprovados. Consultor, regras de páginas e configurações preservados; nenhuma emissão real executada.

- [x] Corrigir Tomador Outros no talão de Serviço: campos abertos e cadastro + conferidos na tela autenticada; dados preservados ao alternar opções, snapshots incluídos na gravação sem alterar registros de teste.

- [x] Remover Documento das duas abas e Forma pagamento da aba Pagas na planilha de Contas a Pagar do fechamento; ZIP de outubro baixado e cabeçalhos conferidos (14 colunas em atraso, 15 em pagas).



- [x] Corrigir arquivo de contas do fechamento: atrasadas por vencimento na competência e pagas por pagamento na competência; 17 testes aprovados e ZIP de outubro conferido com 24 atrasadas e 130 pagamentos, todas as datas na competência.

- [x] Ajustar fechamento contábil: seleção de planos de contas, agências Matriz/Filial - UF, tipo CT-e e Excel de contratos PJ/PF; oito testes aprovados e ZIP real conferido com 80 abertas, 119 pagas, exclusão de plano e contratos em abas separadas.

- [x] Corrigir imagens ausentes nos PDFs HTML compartilhados; três downloads pelo fluxo comum conferidos com marcas e cinco testes aprovados; CT-e/MDF-e preservados.
- [ ] Conferir downloads de contas e faturas existentes: sessão de conferência não retornou contas, impedindo validar documentos reais.
- [x] Trocar o seletor de competência de Fechamento Contábil pelo MonthPicker de clique; painel com 12 meses, troca de ano e seleção conferidos na tela.

- [x] Renomear Faturas a Receber e mostrar saldo/recebimento parcial no grid; fatura 615 e total dos saldos R$ 17.283,61 conferidos na tela, quatro testes aprovados.
- [x] Colocar Valor e Saldo a Receber como duas colunas no fim do grid de Faturas a Receber, sem cortes; títulos completos conferidos na tela com 23 faturas.
- [x] Eliminar títulos cortados nos grids de Contas a Pagar, Contas Pagas e Cheques e permitir rolagem quando o grid é mais largo que a tela; medido em 10 telas.

- [x] Simplificar Nova Despesa em peças, serviço, peças e serviço e despesa geral; soma validada nos três cenários e serviço gravado/conferido na lista, teste removido.

- [x] Aplicar margens de 2 cm no contrato e na fatura, compactar textos secundários; PDFs conferidos: individuais em uma página, lote 9/8 em duas, sem sobreposição e com marcas.

- [x] Igualar o cabeçalho do contrato de frete ao da fatura; contratos 9/8 conferidos, uma página por contrato e margens de 2,5 cm preservadas.

- [x] Criar componente visual único para buscas e filtros.
- [x] Remover todos os campos de busca e filtros das GlobalToolbar.
- [x] Aplicar o card padronizado em páginas financeiras, transporte, cadastros, RH e relatórios.
- [x] Preservar ações informativas e operacionais nas toolbars.
- [x] Validar compilação e páginas representativas no desktop.
- [x] Tornar todos os cards “Filtrar” recolhíveis e fechados por padrão.
- [x] Incluir páginas com filtros residuais no padrão global.
- [x] Reduzir o espaço entre o cabeçalho e o primeiro conteúdo das páginas.
- [x] Validar compilação e apresentação expandida/recolhida.
- [x] Espaçamento único: 8px do cabeçalho, 12px entre blocos em todas as páginas
- [x] Ocultar SuperAdmin da gestão de usuários das empresas.
- [x] Padronizar primeira linha dos filtros: período à esquerda e "Todas as Empresas" à direita.
- [x] Compactar a disposição dos filtros do Fluxo de Caixa.
- [x] Alterar o nome da plataforma para Agiliza ERP em todas as áreas e metadados.
- [x] Selecionar e aplicar a nova logo do Agiliza ERP e seu favicon, identificando a FSM Softwares.
- [x] Atualizar a marca para Agiliza TMS, um produto FSM Systems.
- [x] Criar novos modelos de logo para a FSM Systems e apresentar para escolha antes de aplicar na tela inicial. (Escolhido: verde esmeralda + cinza, S destacado.)
- [x] Combinar verde esmeralda com cinza na logomarca FSM Systems e reaplicar na tela inicial.
- [x] Reordenar o menu lateral: Dashboard, Financeiro, Bancos, Transporte, Frota, Notas Fiscais, Recursos Humanos, Cadastros, Configurações.
- [x] Exibir nome e sobrenome completos na coluna Usuário das listagens de CT-e e MDF-e.
- [x] Nome de usuário muito longo: cortar com "…" e mostrar o completo no hover, como nas colunas Cliente/Descrição.
- [x] Corrigir rolagem duplicada das janelas e validar formulários no desktop e celular.
- [x] Corrigir quitação após editar o total para igualar os pagamentos existentes.
- [x] Localizar os dois pagamentos de R$ 1.518,90 e R$ 337,00 e corrigir sua visibilidade/estorno.
- [x] Validar a conta e o histórico nas telas financeiras com sessão autenticada.
- [x] Corrigir CPF dos condutores no DAMDFE individual e em lote, incluindo manifestos existentes.
- [x] Padronizar nitidez e tamanho das marcas Agiliza TMS by fsm nas impressões HTML e fiscais; preservar cheques sem marcas.
- [x] Validar DAMDFE 8165, lote 8165/8163, DACTE e rodapé HTML; 10 testes aprovados.
- [x] Nas impressões de CT-e e MDF-e, manter somente a marca Agiliza TMS (sem fsm | sistemas).
- [x] Remover o "by" que ficava sozinho no rodapé do DACTE e do DAMDFE; validar com teste.
- [x] Corrigir largura, protocolo e legibilidade do contrato de frete na visualização e na impressão A4.
- [x] Conferir contratos 9 e 8 na janela e no PDF: sem transbordamento, individual em uma página e lote em duas, rodapés por contrato; seis testes aprovados.
- [x] Manter a marca junto das assinaturas, sem reduzir letras ou logos; PDF do contrato 9 em uma página e lote 9/8 em duas, com marcas em ambas; build OK.
- [x] Aplicar margens padrão de 2,5 cm na impressão do contrato de frete e da fatura.
- [x] Validar contrato individual, lote (9/8) e fatura: uma página cada, assinaturas e marca no rodapé, nada cortado.
- [x] Contabilidade > Fechamento Contábil: pacote ZIP da competência (contas a pagar abertas/pagas, CT-es por agência e CST, XMLs, NF-es destinatário).
- [x] Corrigir sobreposição de atrasadas e abertas em Bancos > Relatórios, descontar juros do principal de parcelas, paginar leituras e aplicar período imediatamente; seis testes aprovados e consulta real confirmou quatro parciais vencidas.
- [x] Na seleção de contas do fechamento contábil, listar somente contas de despesa (receitas fora); conferido na tela: 104 opções, nenhuma receita.
- [ ] Comparar totais reais na tela de Bancos e Contas a Pagar: sessão de conferência não acessa contas da Sime e acesso de suporte foi negado.
- [ ] Varredura do DRE: conferir competência e fontes sem confundir com saldo a pagar.
