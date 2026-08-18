ALTER TABLE public.credit_card_invoice_items
  ADD COLUMN IF NOT EXISTS origem_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_payment_id uuid,
  ADD COLUMN IF NOT EXISTS origem_installment_id uuid,
  ADD COLUMN IF NOT EXISTS origem_tipo text;

CREATE INDEX IF NOT EXISTS idx_cc_items_origem_expense
  ON public.credit_card_invoice_items (origem_expense_id)
  WHERE origem_expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_credit_card_invoice_edit(_invoice_id uuid, _invoice jsonb, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_card_invoices WHERE id = _invoice_id AND deleted_at IS NULL
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

  DELETE FROM public.credit_card_invoice_items WHERE invoice_id = _invoice_id;

  INSERT INTO public.credit_card_invoice_items (
    invoice_id, posted_date, description, amount, fitid, plano_contas_id,
    centro_custo, favorecido_id, favorecido_nome, veiculo_id, observacoes,
    parcela_atual, parcela_total, parcelas_expandidas,
    documento_fiscal_tipo, documento_fiscal_numero, chave_nfe, fornecedor_cnpj,
    itens_nota, xml_original, rateio_veiculos,
    origem_expense_id, origem_payment_id, origem_installment_id, origem_tipo
  )
  SELECT _invoice_id,
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
         CASE WHEN e->'rateio_veiculos' = 'null'::jsonb THEN NULL ELSE e->'rateio_veiculos' END,
         NULLIF(e->>'origem_expense_id','')::uuid,
         NULLIF(e->>'origem_payment_id','')::uuid,
         NULLIF(e->>'origem_installment_id','')::uuid,
         NULLIF(e->>'origem_tipo','')
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) e;

  PERFORM public.sync_card_item_rateio(_invoice_id);
END;
$function$;