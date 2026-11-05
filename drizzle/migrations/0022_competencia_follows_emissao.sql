CREATE OR REPLACE FUNCTION public.fn_default_data_competencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_competencia IS NULL THEN
    NEW.data_competencia := NEW.data_emissao;
    RETURN NEW;
  END IF;

  -- Despesas retroativas: quando a data da nota muda e a competência
  -- acompanhava a data anterior (não foi definida à parte), a competência
  -- segue a nova data da nota. Salários têm competência própria.
  IF TG_OP = 'UPDATE'
     AND NEW.data_emissao IS DISTINCT FROM OLD.data_emissao
     AND NEW.data_emissao IS NOT NULL
     AND NEW.data_competencia IS NOT DISTINCT FROM OLD.data_competencia
     AND OLD.data_competencia IS NOT DISTINCT FROM OLD.data_emissao
     AND (NEW.plano_contas_id IS NULL OR NOT public.fn_is_salario_account(NEW.plano_contas_id)) THEN
    NEW.data_competencia := NEW.data_emissao;
  END IF;

  RETURN NEW;
END;
$$;