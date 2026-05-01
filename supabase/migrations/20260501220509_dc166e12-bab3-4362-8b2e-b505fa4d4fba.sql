-- 1. Add counter column to fiscal_establishments
ALTER TABLE public.fiscal_establishments
ADD COLUMN IF NOT EXISTS ultimo_numero_contrato_frete integer NOT NULL DEFAULT 0;

-- 2. Create freight_contracts table
CREATE TABLE public.freight_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cte_id uuid NOT NULL REFERENCES public.ctes(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES public.fiscal_establishments(id),
  numero integer NOT NULL,

  -- Contratado (proprietário do veículo)
  contratado_id uuid REFERENCES public.profiles(id),
  contratado_nome text NOT NULL,
  contratado_documento text,
  contratado_tipo text NOT NULL DEFAULT 'PF', -- 'PF' ou 'PJ'

  -- Motorista
  motorista_id uuid REFERENCES public.profiles(id),
  motorista_nome text,
  motorista_cpf text,

  -- Veículo
  vehicle_id uuid REFERENCES public.vehicles(id),
  placa_veiculo text,
  veiculo_modelo text,

  -- Origem/Destino
  municipio_origem text,
  uf_origem text,
  municipio_destino text,
  uf_destino text,

  -- Carga e valores (independentes do CT-e)
  natureza_carga text,
  peso_kg numeric NOT NULL DEFAULT 0,
  valor_tonelada numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,

  data_contrato date NOT NULL DEFAULT CURRENT_DATE,
  observacoes text,

  -- Vínculo com a conta a pagar gerada
  accounts_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cte_id)
);

CREATE INDEX idx_freight_contracts_cte ON public.freight_contracts(cte_id);
CREATE INDEX idx_freight_contracts_contratado ON public.freight_contracts(contratado_id);
CREATE INDEX idx_freight_contracts_payable ON public.freight_contracts(accounts_payable_id);

-- 3. Trigger updated_at
CREATE TRIGGER trg_freight_contracts_updated
BEFORE UPDATE ON public.freight_contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.freight_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can select freight_contracts"
ON public.freight_contracts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR has_role(auth.uid(), 'operador'::app_role)
);

CREATE POLICY "Staff can insert freight_contracts"
ON public.freight_contracts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR has_role(auth.uid(), 'operador'::app_role)
);

CREATE POLICY "Staff can update freight_contracts"
ON public.freight_contracts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR has_role(auth.uid(), 'operador'::app_role)
);

CREATE POLICY "Admins/Moderators can delete freight_contracts"
ON public.freight_contracts FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);

-- 5. Sequence function
CREATE OR REPLACE FUNCTION public.next_freight_contract_number(_establishment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  IF _establishment_id IS NULL THEN
    SELECT COALESCE(MAX(numero), 0) + 1 INTO next_num FROM freight_contracts;
    RETURN next_num;
  END IF;
  UPDATE fiscal_establishments
  SET ultimo_numero_contrato_frete = ultimo_numero_contrato_frete + 1, updated_at = now()
  WHERE id = _establishment_id
  RETURNING ultimo_numero_contrato_frete INTO next_num;
  RETURN next_num;
END;
$$;

-- 6. Atomic creator: contract + payable
CREATE OR REPLACE FUNCTION public.create_freight_contract_with_payable(
  _cte_id uuid,
  _establishment_id uuid,
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
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Find chart of accounts: leaf containing "frete terceiros"
  SELECT id INTO _category_id
  FROM chart_of_accounts
  WHERE lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c2 WHERE c2.parent_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1;

  IF _category_id IS NULL THEN
    RAISE EXCEPTION 'Plano de contas "Frete Terceiros" não encontrado. Cadastre-o antes de gerar o contrato.';
  END IF;

  _numero := public.next_freight_contract_number(_establishment_id);

  -- Create payable (vencimento à vista = hoje)
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

  -- Create contract
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
$$;