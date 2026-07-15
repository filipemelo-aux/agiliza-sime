-- Backfill: mark all items that belong to a parcelas series as expanded.
WITH base AS (
  SELECT i.id,
         inv.card_name,
         inv.bank_person_id,
         TRIM(REGEXP_REPLACE(i.description, '\s+\d+\s*(/|de)\s*\d+\s*$', '', 'i')) AS base_desc
  FROM public.credit_card_invoice_items i
  JOIN public.credit_card_invoices inv ON inv.id = i.invoice_id
  WHERE i.parcela_atual IS NOT NULL AND i.parcela_total IS NOT NULL
),
series AS (
  SELECT card_name, bank_person_id, base_desc
  FROM base
  GROUP BY card_name, bank_person_id, base_desc
  HAVING COUNT(*) >= 2
)
UPDATE public.credit_card_invoice_items t
SET parcelas_expandidas = true
FROM base b
JOIN series s
  ON s.card_name = b.card_name
 AND COALESCE(s.bank_person_id::text,'') = COALESCE(b.bank_person_id::text,'')
 AND s.base_desc = b.base_desc
WHERE t.id = b.id
  AND COALESCE(t.parcelas_expandidas, false) = false;