-- =============================================================
-- PROMPT 2 — Mapeamento inteligente de competência (salários)
-- =============================================================

-- 1) Tabela de configuração chave-valor do RH
CREATE TABLE IF NOT EXISTS public.rh_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage rh_config" ON public.rh_config;
CREATE POLICY "Admins manage rh_config"
ON public.rh_config FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated read rh_config" ON public.rh_config;
CREATE POLICY "Authenticated read rh_config"
ON public.rh_config FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.rh_config (key, value, description) VALUES
  ('salary_window_tolerance_days', '10'::jsonb,
   'Tolerância (dias) após o fim do período para aceitar despesas como pertencentes àquela quinzena'),
  ('quinzena_1_range', '{"start_day": 1, "end_day": 15}'::jsonb,
   'Faixa de dias que compõe a 1ª quinzena (competência)'),
  ('quinzena_2_range', '{"start_day": 16, "end_day": 31}'::jsonb,
   'Faixa de dias que compõe a 2ª quinzena (competência)')
ON CONFLICT (key) DO NOTHING;

-- 2) Helper para remover acentos sem depender da extensão unaccent
CREATE OR REPLACE FUNCTION public.fn_strip_accents(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    coalesce(_t, ''),
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  )
$$;

-- 3) Função: infere a data_competencia de um SALÁRIO
CREATE OR REPLACE FUNCTION public.fn_infer_salario_competencia(_data_emissao date)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tol int;
  v_q1_end int;
  v_dia int;
BEGIN
  IF _data_emissao IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((value)::text::int, 10) INTO v_tol
    FROM public.rh_config WHERE key = 'salary_window_tolerance_days';
  SELECT COALESCE(((value->>'end_day'))::int, 15) INTO v_q1_end
    FROM public.rh_config WHERE key = 'quinzena_1_range';

  v_tol := COALESCE(v_tol, 10);
  v_q1_end := COALESCE(v_q1_end, 15);
  v_dia := EXTRACT(DAY FROM _data_emissao)::int;

  -- CASO 1: emissão de 01 até (15 + tolerância) → 2ª quinzena do mês ANTERIOR
  IF v_dia >= 1 AND v_dia <= v_q1_end + v_tol THEN
    -- normaliza para dia 16 do mês anterior
    RETURN ((date_trunc('month', _data_emissao) - INTERVAL '1 month')::date + 15);
  END IF;

  -- CASO 2: emissão de 16 até fim do mês → 1ª quinzena do mês CORRENTE (dia 1)
  IF v_dia > v_q1_end THEN
    RETURN date_trunc('month', _data_emissao)::date;
  END IF;

  RETURN _data_emissao;
END;
$$;

-- 4) Identifica se a conta é de SALÁRIO (sem unaccent)
CREATE OR REPLACE FUNCTION public.fn_is_salario_account(_plano_contas_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chart_of_accounts
    WHERE id = _plano_contas_id
      AND (
        lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%salario%'
        OR lower(public.fn_strip_accents(coalesce(nome,''))) LIKE '%folha%'
      )
  )
$$;

-- 5) Trigger: auto-preenche data_competencia para despesas de salário
CREATE OR REPLACE FUNCTION public.fn_auto_competencia_salario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_set_competencia boolean;
BEGIN
  IF NEW.plano_contas_id IS NULL OR NOT public.fn_is_salario_account(NEW.plano_contas_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_user_set_competencia := NEW.data_competencia IS NOT NULL
                              AND NEW.data_competencia <> NEW.data_emissao;
  ELSE
    v_user_set_competencia := NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
                              AND NEW.data_competencia IS NOT NULL;
  END IF;

  IF v_user_set_competencia THEN
    RETURN NEW;
  END IF;

  IF NEW.data_emissao IS NOT NULL THEN
    NEW.data_competencia := public.fn_infer_salario_competencia(NEW.data_emissao);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_competencia_salario ON public.expenses;
CREATE TRIGGER trg_auto_competencia_salario
BEFORE INSERT OR UPDATE OF data_emissao, data_competencia, plano_contas_id
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_competencia_salario();

COMMENT ON FUNCTION public.fn_infer_salario_competencia(date) IS
  'Infere data_competencia de despesa de salário a partir de data_emissao usando janelas em rh_config.';