# Roadmap — Multi-Empresa Financeiro

## Fase 1 — Multi-Empresa (em andamento)
- [x] Migração: `empresa_id` em faturas_recebimento, contas_receber, previsoes_recebimento, movimentacoes_bancarias (backfill Matriz)
- [ ] Componentes compartilhados: `EmpresaSelect` (form, obrigatório), `EmpresaFilter` (Todas/Matriz/Filial), `EmpresaBadge` (M/F)
- [ ] Formulários: Despesa (Contas a Pagar), Lançamento manual do Cartão, Conta a Receber/Previsão, Lançamento manual Fluxo de Caixa/Conciliação
- [ ] Filtros nas listagens: Contas a Pagar, Contas Pagas, Faturamento, Cartão de Crédito, Conciliação
- [ ] DRE e Fluxo de Caixa com filtro de empresa
- [ ] Badge de empresa nos data grids

## Fase 2 — Tesouraria Centralizada (contas bancárias)
- [ ] Criar tabela `contas_bancarias` (banco, agência, conta, apelido, `empresa_id` → fiscal_establishments, ativo) + RLS/GRANTs
- [ ] CRUD de contas bancárias em Configurações/Cadastros
- [ ] FK de `movimentacoes_bancarias.conta_bancaria_id`
- [ ] Modal de baixa (Contas a Pagar) com select de conta bancária listando TODAS as contas do grupo ("Sicoob — Matriz"), sem filtro por empresa da despesa
- [ ] Fluxo de Caixa / Conciliação: saldo e extrato por conta bancária
- [ ] DRE segue alocando custo pela empresa da despesa (fato gerador)

## Fase 3 — Integridade e fonte única (31/08)
- [x] Drop trigger duplicado `trg_validar_conta_receber_recebimento` (contas_receber)
- [x] Triggers AFTER DELETE de limpeza de `movimentacoes_bancarias` (expenses, contas_receber, expense_payments)
- [x] Rateio fonte única: migrar JSONB → `despesa_rateio_veiculos`, refatorar RPCs, DROP coluna `credit_card_invoice_items.rateio_veiculos`, ajustar UI
- [x] Unificar contas a pagar: migrar `accounts_payable` → `expenses`, drop triggers legadas, atestar leitura exclusiva de `expenses`

## Fase 4 — Conciliação (03/09)
- [x] Vinculação de 1 lançamento do extrato a VÁRIAS contas (rateio + confirmação final; ocultar contas já conciliadas)
- [x] Corrigir definitivamente despesa que recebe pagamento mas continua "em aberto" (duplicidade de correspondência paga + a pagar)
