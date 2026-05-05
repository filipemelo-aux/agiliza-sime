CREATE OR REPLACE FUNCTION public.create_freight_contract_with_payable(
  _cte_id uuid, _establishment_id uuid,
  _contratado_id uuid, _contratado_nome text, _contratado_documento text, _contratado_tipo text,
  _motorista_id uuid, _motorista_nome text, _motorista_cpf text,
  _vehicle_id uuid, _placa_veiculo text, _veiculo_modelo text,
  _municipio_origem text, _uf_origem text, _municipio_destino text, _uf_destino text,
  _natureza_carga text, _peso_kg numeric, _valor_tonelada numeric, _valor_total numeric,
  _observacoes text, _user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _numero integer;
  _contract_id uuid;
  _expense_id uuid;
  _plano_id uuid;
  _empresa_id uuid;
  _cte record;
  _origem text;
  _origem_uf text;
  _destino text;
  _destino_uf text;
BEGIN
  IF _contratado_id IS NULL THEN
    RAISE EXCEPTION 'Contratado (proprietário do veículo) é obrigatório para gerar contrato.';
  END IF;
  IF _valor_total IS NULL OR _valor_total <= 0 THEN
    RAISE EXCEPTION 'Valor total do contrato deve ser maior que zero.';
  END IF;

  SELECT * INTO _cte
  FROM public.ctes
  WHERE id = _cte_id;

  _origem := COALESCE(
    NULLIF(_municipio_origem, ''),
    NULLIF(_cte.municipio_origem_nome, ''),
    public.fn_contract_city_from_address(_cte.expedidor_endereco),
    NULLIF(_cte.expedidor_nome, ''),
    public.fn_contract_city_from_address(_cte.remetente_endereco),
    NULLIF(_cte.remetente_nome, '')
  );
  _origem_uf := COALESCE(NULLIF(_uf_origem, ''), NULLIF(_cte.uf_origem, ''), NULLIF(_cte.expedidor_uf, ''), NULLIF(_cte.remetente_uf, ''));

  _destino := COALESCE(
    NULLIF(_municipio_destino, ''),
    NULLIF(_cte.municipio_destino_nome, ''),
    public.fn_contract_city_from_address(_cte.recebedor_endereco),
    NULLIF(_cte.recebedor_nome, ''),
    public.fn_contract_city_from_address(_cte.destinatario_endereco),
    NULLIF(_cte.destinatario_nome, '')
  );
  _destino_uf := COALESCE(NULLIF(_uf_destino, ''), NULLIF(_cte.uf_destino, ''), NULLIF(_cte.recebedor_uf, ''), NULLIF(_cte.destinatario_uf, ''));

  SELECT id INTO _plano_id
  FROM public.chart_of_accounts
  WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1;

  IF _plano_id IS NULL THEN
    RAISE EXCEPTION 'Plano de contas "Frete Terceiros" não encontrado. Cadastre-o antes de gerar o contrato.';
  END IF;

  _empresa_id := COALESCE(
    _establishment_id,
    _cte.establishment_id,
    (SELECT id FROM public.fiscal_establishments ORDER BY created_at LIMIT 1)
  );

  _numero := public.next_freight_contract_number(_empresa_id);

  INSERT INTO public.expenses (
    empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
    valor_total, data_emissao, data_vencimento, status,
    favorecido_id, favorecido_nome, observacoes, created_by, origem
  ) VALUES (
    _empresa_id,
    'Contrato de Frete Nº ' || _numero || ' - ' || COALESCE(_origem, '') || ' → ' || COALESCE(_destino, ''),
    _plano_id,
    'operacional',
    'outros',
    _valor_total,
    CURRENT_DATE,
    CURRENT_DATE,
    'pendente',
    _contratado_id,
    _contratado_nome,
    _observacoes,
    _user_id,
    'manual'
  ) RETURNING id INTO _expense_id;

  INSERT INTO public.freight_contracts (
    cte_id, establishment_id, numero,
    contratado_id, contratado_nome, contratado_documento, contratado_tipo,
    motorista_id, motorista_nome, motorista_cpf,
    vehicle_id, placa_veiculo, veiculo_modelo,
    municipio_origem, uf_origem, municipio_destino, uf_destino,
    natureza_carga, peso_kg, valor_tonelada, valor_total,
    observacoes, accounts_payable_id, created_by
  ) VALUES (
    _cte_id, COALESCE(_establishment_id, _cte.establishment_id), _numero,
    _contratado_id, _contratado_nome, _contratado_documento, COALESCE(_contratado_tipo, 'PF'),
    _motorista_id, _motorista_nome, _motorista_cpf,
    _vehicle_id, _placa_veiculo, _veiculo_modelo,
    _origem, _origem_uf, _destino, _destino_uf,
    COALESCE(NULLIF(_natureza_carga, ''), NULLIF(_cte.produto_predominante, ''), NULLIF(_cte.natureza_operacao, '')),
    COALESCE(_peso_kg, 0), COALESCE(_valor_tonelada, 0), _valor_total,
    _observacoes, _expense_id, _user_id
  ) RETURNING id INTO _contract_id;

  RETURN _contract_id;
END;
$function$;