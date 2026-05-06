-- Garante que CT-es com valor diferente de zero gerem previsão de recebimento
-- e que contratos de frete com valor diferente de zero gerem conta a pagar, incluindo negativos.

CREATE OR REPLACE FUNCTION public.fn_resolve_profile_for_cte_previsao(_cte public.ctes)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_doc text;
  v_profile_id uuid;
BEGIN
  IF _cte.tomador_id IS NOT NULL THEN
    RETURN _cte.tomador_id;
  END IF;

  CASE COALESCE(_cte.tomador_tipo, 0)
    WHEN 0 THEN
      v_name := _cte.remetente_nome;
      v_doc := _cte.remetente_cnpj;
    WHEN 1 THEN
      v_name := _cte.expedidor_nome;
      v_doc := _cte.expedidor_cnpj;
    WHEN 2 THEN
      v_name := _cte.recebedor_nome;
      v_doc := _cte.recebedor_cnpj;
    WHEN 3 THEN
      v_name := _cte.destinatario_nome;
      v_doc := _cte.destinatario_cnpj;
    ELSE
      v_name := _cte.tomador_nome;
      v_doc := _cte.tomador_cnpj;
  END CASE;

  IF NULLIF(regexp_replace(COALESCE(v_doc, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    SELECT p.id INTO v_profile_id
    FROM public.profiles p
    WHERE regexp_replace(COALESCE(p.cnpj, ''), '\D', '', 'g') = regexp_replace(v_doc, '\D', '', 'g')
    ORDER BY CASE WHEN p.category = 'cliente' THEN 0 ELSE 1 END, p.created_at DESC
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL AND NULLIF(btrim(COALESCE(v_name, '')), '') IS NOT NULL THEN
    SELECT p.id INTO v_profile_id
    FROM public.profiles p
    WHERE lower(public.fn_strip_accents(COALESCE(p.razao_social, ''))) = lower(public.fn_strip_accents(v_name))
       OR lower(public.fn_strip_accents(COALESCE(p.full_name, ''))) = lower(public.fn_strip_accents(v_name))
       OR lower(public.fn_strip_accents(COALESCE(p.nome_fantasia, ''))) = lower(public.fn_strip_accents(v_name))
    ORDER BY CASE WHEN p.category = 'cliente' THEN 0 ELSE 1 END, p.created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_cte_previsao_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_data_prevista date;
BEGIN
  IF COALESCE(NEW.valor_frete, 0) = 0 THEN
    DELETE FROM public.previsoes_recebimento
    WHERE origem_tipo = 'cte'
      AND origem_id = NEW.id;
    RETURN NEW;
  END IF;

  v_cliente_id := public.fn_resolve_profile_for_cte_previsao(NEW);
  IF v_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_data_prevista := COALESCE((NEW.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE);

  INSERT INTO public.previsoes_recebimento (
    origem_tipo, origem_id, cliente_id, valor, data_prevista, status
  ) VALUES (
    'cte', NEW.id, v_cliente_id, NEW.valor_frete, v_data_prevista, 'pendente'
  )
  ON CONFLICT (origem_id) WHERE origem_tipo = 'cte'
  DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    valor = EXCLUDED.valor,
    data_prevista = EXCLUDED.data_prevista,
    status = CASE
      WHEN public.previsoes_recebimento.status = 'faturado' THEN public.previsoes_recebimento.status
      ELSE EXCLUDED.status
    END;

  UPDATE public.ctes
  SET tomador_id = v_cliente_id
  WHERE id = NEW.id
    AND tomador_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cte_previsao_recebimento ON public.ctes;
CREATE TRIGGER trg_sync_cte_previsao_recebimento
AFTER INSERT OR UPDATE OF valor_frete, data_emissao, tomador_id, tomador_tipo, remetente_nome, remetente_cnpj, expedidor_nome, expedidor_cnpj, recebedor_nome, recebedor_cnpj, destinatario_nome, destinatario_cnpj, tomador_nome, tomador_cnpj
ON public.ctes
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_cte_previsao_recebimento();

CREATE OR REPLACE FUNCTION public.fn_sync_freight_contract_payable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_plano_id uuid;
  v_empresa_id uuid;
  v_status text;
BEGIN
  v_expense_id := NEW.accounts_payable_id;

  IF v_expense_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.expenses WHERE id = v_expense_id;
    IF v_status IN ('pago', 'parcial') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF COALESCE(NEW.valor_total, 0) = 0 THEN
    IF v_expense_id IS NOT NULL THEN
      UPDATE public.freight_contracts SET accounts_payable_id = NULL WHERE id = NEW.id;
      DELETE FROM public.expenses WHERE id = v_expense_id AND status IN ('pendente', 'atrasado');
    END IF;
    RETURN NEW;
  END IF;

  SELECT id INTO v_plano_id
  FROM public.chart_of_accounts
  WHERE lower(public.fn_strip_accents(COALESCE(nome, ''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1;

  IF v_plano_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_empresa_id := COALESCE(NEW.establishment_id, (SELECT id FROM public.fiscal_establishments ORDER BY created_at LIMIT 1));

  IF v_expense_id IS NULL THEN
    INSERT INTO public.expenses (
      empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
      valor_total, data_emissao, data_vencimento, status,
      favorecido_id, favorecido_nome, observacoes, created_by, origem
    ) VALUES (
      v_empresa_id,
      'Contrato de Frete Nº ' || COALESCE(NEW.numero::text, '') || ' - ' || COALESCE(NEW.municipio_origem, '') || ' → ' || COALESCE(NEW.municipio_destino, ''),
      v_plano_id,
      'operacional',
      'outros',
      NEW.valor_total,
      CURRENT_DATE,
      CURRENT_DATE,
      'pendente',
      NEW.contratado_id,
      NEW.contratado_nome,
      NEW.observacoes,
      NEW.created_by,
      'manual'
    ) RETURNING id INTO v_expense_id;

    UPDATE public.freight_contracts
    SET accounts_payable_id = v_expense_id
    WHERE id = NEW.id;
  ELSE
    UPDATE public.expenses SET
      descricao = 'Contrato de Frete Nº ' || COALESCE(NEW.numero::text, '') || ' - ' || COALESCE(NEW.municipio_origem, '') || ' → ' || COALESCE(NEW.municipio_destino, ''),
      valor_total = NEW.valor_total,
      favorecido_id = NEW.contratado_id,
      favorecido_nome = NEW.contratado_nome,
      observacoes = NEW.observacoes,
      updated_at = now()
    WHERE id = v_expense_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_freight_contract_payable ON public.freight_contracts;
CREATE TRIGGER trg_sync_freight_contract_payable
AFTER INSERT OR UPDATE OF valor_total, accounts_payable_id, contratado_id, contratado_nome, observacoes, municipio_origem, municipio_destino, establishment_id
ON public.freight_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_freight_contract_payable();

-- Backfill CT-es existentes com valor diferente de zero e sem previsão.
INSERT INTO public.previsoes_recebimento (
  origem_tipo, origem_id, cliente_id, valor, data_prevista, status
)
SELECT
  'cte',
  c.id,
  public.fn_resolve_profile_for_cte_previsao(c),
  c.valor_frete,
  COALESCE((c.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE),
  'pendente'
FROM public.ctes c
LEFT JOIN public.previsoes_recebimento p
  ON p.origem_tipo = 'cte'
 AND p.origem_id = c.id
WHERE COALESCE(c.valor_frete, 0) <> 0
  AND p.id IS NULL
  AND public.fn_resolve_profile_for_cte_previsao(c) IS NOT NULL
ON CONFLICT (origem_id) WHERE origem_tipo = 'cte'
DO UPDATE SET
  cliente_id = EXCLUDED.cliente_id,
  valor = EXCLUDED.valor,
  data_prevista = EXCLUDED.data_prevista;

UPDATE public.ctes c
SET tomador_id = public.fn_resolve_profile_for_cte_previsao(c)
WHERE c.tomador_id IS NULL
  AND COALESCE(c.valor_frete, 0) <> 0
  AND public.fn_resolve_profile_for_cte_previsao(c) IS NOT NULL;

-- Backfill contratos existentes com valor diferente de zero e sem conta a pagar.
WITH plano AS (
  SELECT id
  FROM public.chart_of_accounts
  WHERE lower(public.fn_strip_accents(COALESCE(nome, ''))) LIKE '%frete%terceiro%'
    AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c2 WHERE c2.conta_pai_id = chart_of_accounts.id)
  ORDER BY nome
  LIMIT 1
), missing AS (
  SELECT
    fc.id AS contract_id,
    COALESCE(fc.establishment_id, (SELECT id FROM public.fiscal_establishments ORDER BY created_at LIMIT 1)) AS empresa_id,
    'Contrato de Frete Nº ' || COALESCE(fc.numero::text, '') || ' - ' || COALESCE(fc.municipio_origem, '') || ' → ' || COALESCE(fc.municipio_destino, '') AS descricao,
    fc.valor_total,
    fc.contratado_id,
    fc.contratado_nome,
    fc.observacoes,
    fc.created_by
  FROM public.freight_contracts fc
  LEFT JOIN public.expenses e ON e.id = fc.accounts_payable_id AND e.deleted_at IS NULL
  WHERE COALESCE(fc.valor_total, 0) <> 0
    AND e.id IS NULL
), inserted AS (
  INSERT INTO public.expenses (
    empresa_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
    valor_total, data_emissao, data_vencimento, status,
    favorecido_id, favorecido_nome, observacoes, created_by, origem
  )
  SELECT
    m.empresa_id,
    m.descricao,
    p.id,
    'operacional',
    'outros',
    m.valor_total,
    CURRENT_DATE,
    CURRENT_DATE,
    'pendente',
    m.contratado_id,
    m.contratado_nome,
    m.observacoes,
    m.created_by,
    'manual'
  FROM missing m
  CROSS JOIN plano p
  RETURNING id, descricao
)
UPDATE public.freight_contracts fc
SET accounts_payable_id = i.id
FROM inserted i
WHERE i.descricao = 'Contrato de Frete Nº ' || COALESCE(fc.numero::text, '') || ' - ' || COALESCE(fc.municipio_origem, '') || ' → ' || COALESCE(fc.municipio_destino, '')
  AND fc.accounts_payable_id IS NULL;