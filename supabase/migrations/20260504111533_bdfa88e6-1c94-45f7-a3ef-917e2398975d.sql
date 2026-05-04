
-- Refatora função para criar contrato de frete usando tabela `expenses` (Contas a Pagar real)
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
BEGIN
  IF _contratado_id IS NULL THEN
    RAISE EXCEPTION 'Contratado (proprietário do veículo) é obrigatório para gerar contrato.';
  END IF;
  IF _valor_total IS NULL OR _valor_total <= 0 THEN
    RAISE EXCEPTION 'Valor total do contrato deve ser maior que zero.';
  END IF;

  -- Plano de contas: folha de "Frete Terceiros"
  SELECT id INTO _plano_id
  FROM chart_of_accounts
  WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1;

  IF _plano_id IS NULL THEN
    RAISE EXCEPTION 'Plano de contas "Frete Terceiros" não encontrado. Cadastre-o antes de gerar o contrato.';
  END IF;

  -- Empresa: usa o estabelecimento do CT-e ou o Matriz como fallback
  _empresa_id := COALESCE(
    _establishment_id,
    (SELECT id FROM fiscal_establishments ORDER BY created_at LIMIT 1)
  );

  _numero := public.next_freight_contract_number(_establishment_id);

  INSERT INTO expenses (
    empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
    valor_total, data_emissao, data_vencimento, status,
    favorecido_id, favorecido_nome, observacoes, created_by, origem
  ) VALUES (
    _empresa_id,
    'Contrato de Frete Nº ' || _numero || ' - ' || COALESCE(_municipio_origem, '') || ' → ' || COALESCE(_municipio_destino, ''),
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
    _observacoes, _expense_id, _user_id
  ) RETURNING id INTO _contract_id;

  RETURN _contract_id;
END;
$function$;

-- Migrar contratos existentes que ficaram em accounts_payable para expenses
DO $$
DECLARE
  r RECORD;
  _new_expense uuid;
  _plano uuid;
  _empresa uuid;
BEGIN
  SELECT id INTO _plano FROM chart_of_accounts
  WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome LIMIT 1;

  FOR r IN
    SELECT fc.id AS contract_id, fc.numero, fc.valor_total, fc.contratado_id, fc.contratado_nome,
           fc.observacoes, fc.created_by, fc.establishment_id, fc.accounts_payable_id,
           fc.municipio_origem, fc.municipio_destino,
           ap.status AS ap_status
    FROM freight_contracts fc
    JOIN accounts_payable ap ON ap.id = fc.accounts_payable_id
  LOOP
    _empresa := COALESCE(r.establishment_id,
      (SELECT id FROM fiscal_establishments ORDER BY created_at LIMIT 1));

    INSERT INTO expenses (
      empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
      valor_total, data_emissao, data_vencimento, status,
      favorecido_id, favorecido_nome, observacoes, created_by, origem
    ) VALUES (
      _empresa,
      'Contrato de Frete Nº ' || r.numero || ' - ' || COALESCE(r.municipio_origem,'') || ' → ' || COALESCE(r.municipio_destino,''),
      _plano, 'operacional', 'outros',
      r.valor_total, CURRENT_DATE, CURRENT_DATE,
      COALESCE(r.ap_status, 'pendente')::expense_status,
      r.contratado_id, r.contratado_nome, r.observacoes, r.created_by, 'manual'
    ) RETURNING id INTO _new_expense;

    UPDATE freight_contracts SET accounts_payable_id = _new_expense WHERE id = r.contract_id;
    DELETE FROM accounts_payable WHERE id = r.accounts_payable_id;
  END LOOP;
END $$;
