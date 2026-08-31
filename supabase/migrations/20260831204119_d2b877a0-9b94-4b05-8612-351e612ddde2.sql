-- 1. Backfill: migrar rateios que existem apenas no JSONB para a tabela normalizada
INSERT INTO public.despesa_rateio_veiculos (card_item_id, veiculo_id, valor_rateado, percentual)
SELECT i.id,
       (e->>'veiculo_id')::uuid,
       COALESCE((e->>'valor_rateado')::numeric, 0),
       NULLIF(e->>'percentual','')::numeric
FROM public.credit_card_invoice_items i
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.rateio_veiculos, '[]'::jsonb)) e
WHERE i.rateio_veiculos IS NOT NULL
  AND i.rateio_veiculos <> 'null'::jsonb
  AND (e->>'veiculo_id') IS NOT NULL
  AND COALESCE((e->>'valor_rateado')::numeric, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.despesa_rateio_veiculos r
    WHERE r.card_item_id = i.id
      AND r.veiculo_id = (e->>'veiculo_id')::uuid
  );

-- 2. Refatorar save_credit_card_invoice_edit: rateios gravados só na tabela relacional
CREATE OR REPLACE FUNCTION public.save_credit_card_invoice_edit(_invoice_id uuid, _invoice jsonb, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e jsonb;
  _new_item_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_card_invoice_items WHERE id = _invoice_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;

  UPDATE public.credit_card_invoices
     SET empresa_id = NULLIF(_invoice->>'empresa_id','')::uuid,
         card_name = _invoice->>'card_name',
         bank_person_id = NULLIF(_invoice->>'bank_person_id','')::uuid,
         reference_label = _invoice->>'reference_label',
         due_date = NULLIF(_invoice->>'due_date','')::date,
         closing_date = NULLIF(_invoice->>'closing_date','')::date,
         total_amount = COALESCE((_invoice->>'total_amount')::numeric, 0),
         status = _invoice->>'status',
         ofx_file_name = _invoice->>'ofx_file_name',
         ofx_bank_name = _invoice->>'ofx_bank_name',
         ofx_account_id = _invoice->>'ofx_account_id',
         observacoes = _invoice->>'observacoes',
         updated_at = now()
   WHERE id = _invoice_id;

  -- Remove rateios antigos antes de remover os itens
  DELETE FROM public.despesa_rateio_veiculos r
  USING public.credit_card_invoice_items i
  WHERE r.card_item_id = i.id AND i.invoice_id = _invoice_id;

  DELETE FROM public.credit_card_invoice_items WHERE invoice_id = _invoice_id;

  FOR e IN SELECT val FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS t(val)
  LOOP
    INSERT INTO public.credit_card_invoice_items (
      invoice_id, posted_date, description, amount, fitid, plano_contas_id,
      centro_custo, favorecido_id, favorecido_nome, veiculo_id, observacoes,
      parcela_atual, parcela_total, parcelas_expandidas,
      documento_fiscal_tipo, documento_fiscal_numero, chave_nfe, fornecedor_cnpj,
      itens_nota, xml_original,
      origem_expense_id, origem_payment_id, origem_installment_id, origem_tipo
    ) VALUES (
      _invoice_id,
      NULLIF(e->>'posted_date','')::date,
      e->>'description',
      COALESCE((e->>'amount')::numeric, 0),
      e->>'fitid',
      NULLIF(e->>'plano_contas_id','')::uuid,
      e->>'centro_custo',
      NULLIF(e->>'favorecido_id','')::uuid,
      e->>'favorecido_nome',
      NULLIF(e->>'veiculo_id','')::uuid,
      e->>'observacoes',
      NULLIF(e->>'parcela_atual','')::int,
      NULLIF(e->>'parcela_total','')::int,
      COALESCE((e->>'parcelas_expandidas')::boolean, false),
      e->>'documento_fiscal_tipo',
      e->>'documento_fiscal_numero',
      e->>'chave_nfe',
      e->>'fornecedor_cnpj',
      CASE WHEN e->'itens_nota' = 'null'::jsonb THEN NULL ELSE e->'itens_nota' END,
      e->>'xml_original',
      NULLIF(e->>'origem_expense_id','')::uuid,
      NULLIF(e->>'origem_payment_id','')::uuid,
      NULLIF(e->>'origem_installment_id','')::uuid,
      NULLIF(e->>'origem_tipo','')
    ) RETURNING id INTO _new_item_id;

    -- Grava rateios exclusivamente na tabela relacional
    INSERT INTO public.despesa_rateio_veiculos (card_item_id, veiculo_id, valor_rateado, percentual, created_by)
    SELECT _new_item_id,
           (r->>'veiculo_id')::uuid,
           COALESCE((r->>'valor_rateado')::numeric, 0),
           NULLIF(r->>'percentual','')::numeric,
           auth.uid()
    FROM jsonb_array_elements(COALESCE(e->'rateio_veiculos', '[]'::jsonb)) r
    WHERE (r->>'veiculo_id') IS NOT NULL
      AND COALESCE((r->>'valor_rateado')::numeric, 0) > 0;
  END LOOP;
END;
$function$;

-- 3. sync_card_item_rateio torna-se obsoleto (rateio já é gravado no save); mantido como no-op por compatibilidade
CREATE OR REPLACE FUNCTION public.sync_card_item_rateio(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Fonte única: despesa_rateio_veiculos. Nada a sincronizar.
  RETURN;
END;
$function$;

-- 4. Remover a coluna JSONB duplicada
ALTER TABLE public.credit_card_invoice_items DROP COLUMN IF EXISTS rateio_veiculos;