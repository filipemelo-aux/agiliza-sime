CREATE OR REPLACE FUNCTION public.create_freight_contract_with_payable(_cte_id uuid, _establishment_id uuid, _contratado_id uuid, _contratado_nome text, _contratado_documento text, _contratado_tipo text, _motorista_id uuid, _motorista_nome text, _motorista_cpf text, _vehicle_id uuid, _placa_veiculo text, _veiculo_modelo text, _municipio_origem text, _uf_origem text, _municipio_destino text, _uf_destino text, _natureza_carga text, _peso_kg numeric, _valor_tonelada numeric, _valor_total numeric, _observacoes text, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _numero integer;
  _contract_id uuid;
  _payable_id uuid;
  _category_id uuid;
BEGIN
  IF _contratado_id IS NULL THEN
    RAISE EXCEPTION 'Contratado (proprietário do veículo) é obrigatório para gerar contrato.';
  END IF;
  IF _valor_total IS NULL OR _valor_total <= 0 THEN
    RAISE EXCEPTION 'Valor total do contrato deve ser maior que zero.';
  END IF;

  SELECT id INTO _category_id
  FROM chart_of_accounts
  WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1;

  IF _category_id IS NULL THEN
    RAISE EXCEPTION 'Plano de contas "Frete Terceiros" não encontrado. Cadastre-o antes de gerar o contrato.';
  END IF;

  _numero := public.next_freight_contract_number(_establishment_id);

  INSERT INTO accounts_payable (
    description, category_id, amount, due_date, status,
    creditor_id, creditor_name, notes, created_by, data_lancamento
  ) VALUES (
    'Contrato de Frete Nº ' || _numero || ' - ' || COALESCE(_municipio_origem, '') || ' → ' || COALESCE(_municipio_destino, ''),
    _category_id,
    _valor_total,
    CURRENT_DATE,
    'pendente',
    _contratado_id,
    _contratado_nome,
    _observacoes,
    _user_id,
    CURRENT_DATE
  ) RETURNING id INTO _payable_id;

  INSERT INTO freight_contracts (
    cte_id, establishment_id, numero,
    contratado_id, contratado_nome, contratado_documento, contratado_tipo,
    motorista_id, motorista_nome, motorista_cpf,
    vehicle_id, placa_veiculo, veiculo_modelo,
    municipio_origem, uf_origem, municipio_destino, uf_destino,
    natureza_carga, peso_kg, valor_tonelada, valor_total,
    observacoes, accounts_payable_id, created_by
  ) VALUES (
    _cte_id, _establishment_id, _numero,
    _contratado_id, _contratado_nome, _contratado_documento, COALESCE(_contratado_tipo, 'PF'),
    _motorista_id, _motorista_nome, _motorista_cpf,
    _vehicle_id, _placa_veiculo, _veiculo_modelo,
    _municipio_origem, _uf_origem, _municipio_destino, _uf_destino,
    _natureza_carga, COALESCE(_peso_kg, 0), COALESCE(_valor_tonelada, 0), _valor_total,
    _observacoes, _payable_id, _user_id
  ) RETURNING id INTO _contract_id;

  RETURN _contract_id;
END;
$function$;