# Quitar contas a pagar via lançamento de cartão (baixa pelo cartão / conciliação)

## O conceito correto (contábil)

Pagar com cartão **não é saída de caixa**. É uma *troca de credor*: a obrigação sai do fornecedor e passa para a administradora do cartão. O dinheiro só sai quando a **fatura** é paga.

```text
Lançamento na fatura do cartão  --vinculado-->  Conta a pagar do fornecedor
        |                                              |
        |                                              v
        |                                     quitada, SEM saída de caixa
        v
  Fatura fechada -> título único no Contas a Pagar -> pagamento da fatura = saída de caixa real
```

## Mudança de fluxo: a baixa nasce no cartão, não no Contas a Pagar

Em vez de o usuário abrir a conta a pagar e dizer "paguei no cartão", ele trabalha do lado do extrato — que é onde o fato realmente aparece:

- **Na edição da fatura do cartão:** cada linha ganha a ação **"Vincular a conta a pagar"**. Ao clicar, abre uma busca das contas em aberto (sugestões automáticas por valor aproximado, favorecido e proximidade de data). Confirmando, a conta é quitada.
- **Na conciliação bancária:** mesma mecânica para a linha do extrato/OFX — quando a linha corresponde a uma despesa já cadastrada, o vínculo quita a conta em vez de criar um lançamento solto.

Isso elimina digitação dupla: o lançamento já existe (veio do OFX/XML do cartão), só falta dizer a qual obrigação ele pertence.

## Efeito da confirmação do vínculo

1. Cria `expense_payments` com `forma_pagamento = 'cartao_credito'`, `data_pagamento` = data do lançamento e `skip_cashflow = true` — a conta fica **paga** e o caixa **não** é tocado.
2. Grava o vínculo no item da fatura (`origem_expense_id` / `origem_payment_id`).
3. O item herda o plano de contas e o favorecido da despesa vinculada (se ainda não classificado), mantendo a DRE correta.
4. Valor parcial permitido: se o lançamento do cartão for menor que o saldo, a conta fica **parcial**; se maior, a diferença vira juros, como já ocorre hoje.

## Por que isso não bagunça a estrutura atual

Todas as peças já existem:

- `expense_payments.skip_cashflow` — já respeitado pelo gatilho de fluxo de caixa; é exatamente o mecanismo de quitar sem gerar saída.
- `credit_card_invoices.expense_id` — a fatura já gera o título consolidado no Contas a Pagar, único ponto de saída de caixa.
- A conciliação já compara lançamentos com o sistema e já tem o conceito de "só no sistema" / correspondência aproximada.
- Nenhum gatilho de `movimentacoes_bancarias` é alterado.

## Regras de proteção

- Um lançamento de cartão só pode estar vinculado a **uma** conta a pagar (e vice-versa por parcela); tentativas de duplicar são bloqueadas.
- Contas já pagas não aparecem na busca de vínculo.
- **Desvincular** estorna o `expense_payments` e devolve a conta ao status anterior (aberta/parcial). Se a fatura já estiver paga/fechada, o desvínculo é bloqueado com aviso — mesma regra já usada na edição de fatura paga.
- Itens vinculados não geram novo título no Contas a Pagar; entram só no total da fatura, evitando dupla contagem.
- Indicadores visuais: selo "Quita conta a pagar" na linha da fatura e "Pago via cartão X — fatura MM/AAAA" na despesa.

## Detalhes técnicos

- Migração: `ALTER TABLE credit_card_invoice_items ADD COLUMN origem_expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL, ADD COLUMN origem_payment_id uuid REFERENCES expense_payments(id) ON DELETE SET NULL;` + índice parcial e índice único em `origem_expense_id`. RLS herdada, sem mudanças.
- Frontend:
  - `src/components/financial/CreditCardImportDialog.tsx` — ação de vincular/desvincular por linha + modal de busca de contas em aberto com sugestões.
  - `src/components/financial/BankReconciliation.tsx` — mesma ação nas linhas conciliadas.
  - Novo componente compartilhado de busca/sugestão de contas a pagar em aberto.
  - `PaymentDischargeDialog` permanece como está (opcionalmente exibindo, em modo leitura, que a baixa veio do cartão).
