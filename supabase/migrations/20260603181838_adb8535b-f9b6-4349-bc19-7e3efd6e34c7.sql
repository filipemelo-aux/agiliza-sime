-- Backfill installment_id on expense_payments where it's NULL but the expense has paid installments.
-- Strategy: for each payment without installment_id, link to a paid installment of the same expense
-- with matching valor, preferring the earliest unlinked one.

WITH candidatos AS (
  SELECT 
    ep.id AS payment_id,
    ep.expense_id,
    ep.valor,
    ei.id AS installment_id,
    ei.numero_parcela,
    ROW_NUMBER() OVER (
      PARTITION BY ep.id 
      ORDER BY ei.numero_parcela
    ) AS rn_pay,
    ROW_NUMBER() OVER (
      PARTITION BY ei.id 
      ORDER BY ep.created_at
    ) AS rn_inst
  FROM expense_payments ep
  JOIN expense_installments ei 
    ON ei.expense_id = ep.expense_id
   AND ei.status = 'pago'
   AND ABS(ei.valor - ep.valor) < 0.01
  WHERE ep.installment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM expense_payments ep2
      WHERE ep2.installment_id = ei.id
    )
)
UPDATE expense_payments ep
SET installment_id = c.installment_id
FROM candidatos c
WHERE ep.id = c.payment_id
  AND c.rn_pay = 1
  AND c.rn_inst = 1;