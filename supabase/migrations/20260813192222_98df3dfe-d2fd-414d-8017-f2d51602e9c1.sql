ALTER TABLE public.credit_card_invoice_items
  ADD COLUMN IF NOT EXISTS documento_fiscal_tipo text,
  ADD COLUMN IF NOT EXISTS documento_fiscal_numero text,
  ADD COLUMN IF NOT EXISTS chave_nfe text,
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj text,
  ADD COLUMN IF NOT EXISTS itens_nota jsonb,
  ADD COLUMN IF NOT EXISTS xml_original text;

CREATE OR REPLACE FUNCTION public.save_credit_card_invoice_edit(_invoice_id uuid, _invoice jsonb, _items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar faturas de cartão';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_card_invoices WHERE id = _invoice_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fatura de cartão não encontrada';
  END IF;

  UPDATE public.credit_card_invoices
  SET empresa_id = NULLIF(_invoice->>'empresa_id', '')::uuid,
      card_name = trim(_invoice->>'card_name'),
      bank_person_id = NULLIF(_invoice->>'bank_person_id', '')::uuid,
      reference_label = NULLIF(_invoice->>'reference_label', ''),
      due_date = (_invoice->>'due_date')::date,
      closing_date = NULLIF(_invoice->>'closing_date', '')::date,
      total_amount = COALESCE((_invoice->>'total_amount')::numeric, 0),
      status = COALESCE(NULLIF(_invoice->>'status', ''), 'aberta'),
      ofx_file_name = NULLIF(_invoice->>'ofx_file_name', ''),
      ofx_bank_name = NULLIF(_invoice->>'ofx_bank_name', ''),
      ofx_account_id = NULLIF(_invoice->>'ofx_account_id', ''),
      observacoes = NULLIF(_invoice->>'observacoes', ''),
      updated_at = now()
  WHERE id = _invoice_id;

  DELETE FROM public.credit_card_invoice_items WHERE invoice_id = _invoice_id;

  INSERT INTO public.credit_card_invoice_items (
    invoice_id, posted_date, description, amount, fitid, plano_contas_id,
    centro_custo, favorecido_id, favorecido_nome, veiculo_id, observacoes,
    parcela_atual, parcela_total, parcelas_expandidas,
    documento_fiscal_tipo, documento_fiscal_numero, chave_nfe, fornecedor_cnpj,
    itens_nota, xml_original
  )
  SELECT
    _invoice_id,
    (item->>'posted_date')::date,
    item->>'description',
    (item->>'amount')::numeric,
    NULLIF(item->>'fitid', ''),
    NULLIF(item->>'plano_contas_id', '')::uuid,
    NULLIF(item->>'centro_custo', ''),
    NULLIF(item->>'favorecido_id', '')::uuid,
    NULLIF(item->>'favorecido_nome', ''),
    NULLIF(item->>'veiculo_id', '')::uuid,
    NULLIF(item->>'observacoes', ''),
    NULLIF(item->>'parcela_atual', '')::integer,
    NULLIF(item->>'parcela_total', '')::integer,
    COALESCE((item->>'parcelas_expandidas')::boolean, false),
    NULLIF(item->>'documento_fiscal_tipo', ''),
    NULLIF(item->>'documento_fiscal_numero', ''),
    NULLIF(item->>'chave_nfe', ''),
    NULLIF(item->>'fornecedor_cnpj', ''),
    CASE WHEN item->'itens_nota' IS NULL OR item->'itens_nota' = 'null'::jsonb THEN NULL ELSE item->'itens_nota' END,
    NULLIF(item->>'xml_original', '')
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS item;
END;
$function$;