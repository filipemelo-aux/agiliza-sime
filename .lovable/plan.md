# Pagar uma conta do Contas a Pagar com Cartão de Crédito

## O conceito correto (contábil)

Pagar com cartão **não é saída de caixa**. É uma *troca de credor*: a obrigação sai do fornecedor e passa para a administradora do cartão. O dinheiro só sai quando a **fatura** é paga.

Portanto a regra é:

```text
Conta a pagar (fornecedor)  --pago com cartão-->  quitada, SEM movimentação de caixa
        |
        v
  vira um item da fatura do cartão (mês/vencimento escolhido)
        |
        v
  Fatura fechada -> gera o título único no Contas a Pagar -> pagamento da fatura = saída de caixa real
```

Isso preserva tudo que já existe: a despesa continua com seu plano de contas (competência/DRE intacta), e o caixa é impactado uma única vez, na fatura.

## Por que isso encaixa na estrutura atual sem bagunçar

O sistema já tem todas as peças:

- `expense_payments.skip_cashflow` — já existe e já é respeitado pelo gatilho de fluxo de caixa. É exatamente o mecanismo para quitar sem gerar saída de caixa.
- `credit_card_invoice_items` — já suporta lançamento avulso com plano de contas, favorecido, veículo, rateio e parcelamento.
- `credit_card_invoices.expense_id` — a fatura já gera o título consolidado no Contas a Pagar, que é onde o caixa é debitado.
- A forma de pagamento `cartao_credito` já existe no diálogo de baixa.

Ou seja: nada de tabela nova, nada de mudar o fluxo de caixa. Só amarrar as duas pontas.

## O que será implementado

1. **Baixa por cartão no diálogo de pagamento** (`PaymentDischargeDialog`)
   - Ao escolher "Cartão de Crédito", aparecem dois campos: **Cartão** e **Fatura de destino** (faturas abertas, exibindo mês/vencimento; opção de criar a próxima fatura se não existir).
   - Opcional: **parcelar** em N vezes — cria um item em cada fatura seguinte (usa a mesma lógica de parcelas já existente no módulo de cartão).

2. **Efeito da confirmação**
   - Registra `expense_payments` com `forma_pagamento = 'cartao_credito'` e `skip_cashflow = true` (quita a conta, não toca no caixa).
   - Cria o(s) item(ns) na fatura escolhida, herdando descrição, favorecido, plano de contas e valor da despesa de origem.
   - Recalcula o `total_amount` da fatura.

3. **Rastreabilidade (ida e volta)**
   - Nova coluna `origem_expense_id` (e `origem_payment_id`) em `credit_card_invoice_items`, apenas como vínculo.
   - No item da fatura: selo "Origem: Contas a Pagar" com link para a despesa.
   - Na despesa quitada: indicação "Pago via cartão X — fatura MM/AAAA".

4. **Estorno seguro**
   - Estornar o pagamento remove o(s) item(ns) da fatura e recalcula o total.
   - Se a fatura já estiver paga/fechada, bloqueia com aviso (mesma regra já usada hoje na edição de fatura paga).

5. **Proteção contra dupla contagem**
   - Itens de fatura originados do Contas a Pagar não geram novo título no Contas a Pagar; entram só no total da fatura.
   - Nos relatórios, a despesa aparece uma única vez (na competência original); o pagamento da fatura aparece só no fluxo de caixa.

## Detalhes técnicos

- Migração: `ALTER TABLE credit_card_invoice_items ADD COLUMN origem_expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL, ADD COLUMN origem_payment_id uuid REFERENCES expense_payments(id) ON DELETE SET NULL;` + índice parcial. Sem mudança de RLS (herda as políticas existentes da tabela).
- Frontend: `src/components/financial/PaymentDischargeDialog.tsx` (novo bloco condicional), reaproveitando o seletor de faturas de `CreditCardInvoices.tsx` e a lógica de expansão de parcelas do `CreditCardImportDialog.tsx`.
- Nenhuma alteração nos gatilhos de `movimentacoes_bancarias` — o comportamento desejado já vem de `skip_cashflow = true`.
