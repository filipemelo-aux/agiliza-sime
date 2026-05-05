CREATE OR REPLACE FUNCTION public.update_freight_contract_with_payable(
  _contract_id uuid,
  _contratado_id uuid,
  _contratado_nome text,
  _contratado_documento text,
  _contratado_tipo text,
  _motorista_id uuid,
  _motorista_nome text,
  _motorista_cpf text,
  _vehicle_id uuid,
  _placa_veiculo text,
  _veiculo_modelo text,
  _municipio_origem text,
  _uf_origem text,
  _municipio_destino text,
  _uf_destino text,
  _natureza_carga text,
  _peso_kg numeric,
  _valor_tonelada numeric,
  _valor_total numeric,
  _observacoes text,
  _user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _contract record;
  _expense_id uuid;
  _plano_id uuid;
  _empresa_id uuid;
  _payable_status text;
BEGIN
  IF _contratado_id IS NULL THEN
    RAISE EXCEPTION 'Contratado (proprietário do veículo) é obrigatório.';
  END IF;

  SELECT * INTO _contract FROM public.freight_contracts WHERE id = _contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', _contract_id;
  END IF;

  _expense_id := _contract.accounts_payable_id;
  _empresa_id := COALESCE(_contract.establishment_id, (SELECT id FROM public.fiscal_establishments ORDER BY created_at LIMIT 1));

  -- Bloqueia edição se a conta a pagar vinculada já estiver paga/parcial
  IF _expense_id IS NOT NULL THEN
    SELECT status INTO _payable_status FROM public.expenses WHERE id = _expense_id;
    IF _payable_status IN ('pago', 'parcial') THEN
      RAISE EXCEPTION 'Contrato com pagamento (status %) não pode ser editado. Estorne primeiro.', _payable_status;
    END IF;
  END IF;

  -- Atualiza o contrato
  UPDATE public.freight_contracts SET
    contratado_id = _contratado_id,
    contratado_nome = _contratado_nome,
    contratado_documento = _contratado_documento,
    contratado_tipo = COALESCE(_contratado_tipo, 'PF'),
    motorista_id = _motorista_id,
    motorista_nome = _motorista_nome,
    motorista_cpf = _motorista_cpf,
    vehicle_id = _vehicle_id,
    placa_veiculo = _placa_veiculo,
    veiculo_modelo = _veiculo_modelo,
    municipio_origem = _municipio_origem,
    uf_origem = _uf_origem,
    municipio_destino = _municipio_destino,
    uf_destino = _uf_destino,
    natureza_carga = _natureza_carga,
    peso_kg = COALESCE(_peso_kg, 0),
    valor_tonelada = COALESCE(_valor_tonelada, 0),
    valor_total = COALESCE(_valor_total, 0),
    observacoes = _observacoes,
    updated_at = now()
  WHERE id = _contract_id;

  -- Sincroniza a conta a pagar
  IF COALESCE(_valor_total, 0) > 0 THEN
    IF _expense_id IS NULL THEN
      -- Criar nova conta a pagar
      SELECT id INTO _plano_id
      FROM public.chart_of_accounts
      WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
        AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
      ORDER BY nome
      LIMIT 1;

      IF _plano_id IS NULL THEN
        RAISE EXCEPTION 'Plano de contas "Frete Terceiros" não encontrado.';
      END IF;

      INSERT INTO public.expenses (
        empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
        valor_total, data_emissao, data_vencimento, status,
        favorecido_id, favorecido_nome, observacoes, created_by, origem
      ) VALUES (
        _empresa_id,
        'Contrato de Frete Nº ' || _contract.numero || ' - ' || COALESCE(_municipio_origem, '') || ' → ' || COALESCE(_municipio_destino, ''),
        _plano_id, 'operacional', 'outros',
        _valor_total, CURRENT_DATE, CURRENT_DATE, 'pendente',
        _contratado_id, _contratado_nome, _observacoes, _user_id, 'manual'
      ) RETURNING id INTO _expense_id;

      UPDATE public.freight_contracts SET accounts_payable_id = _expense_id WHERE id = _contract_id;
    ELSE
      -- Atualizar conta a pagar existente
      UPDATE public.expenses SET
        descricao = 'Contrato de Frete Nº ' || _contract.numero || ' - ' || COALESCE(_municipio_origem, '') || ' → ' || COALESCE(_municipio_destino, ''),
        valor_total = _valor_total,
        favorecido_id = _contratado_id,
        favorecido_nome = _contratado_nome,
        observacoes = _observacoes,
        updated_at = now()
      WHERE id = _expense_id;
    END IF;
  ELSE
    -- Valor zerado/negativo: remover conta a pagar se existir e estiver pendente
    IF _expense_id IS NOT NULL THEN
      UPDATE public.freight_contracts SET accounts_payable_id = NULL WHERE id = _contract_id;
      DELETE FROM public.expenses WHERE id = _expense_id AND status IN ('pendente', 'atrasado');
    END IF;
  END IF;

  RETURN _contract_id;
END;
$function$;