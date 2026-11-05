CREATE OR REPLACE FUNCTION public.fn_default_data_competencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.data_emissao IS NOT NULL
     AND (NEW.plano_contas_id IS NULL OR NOT public.fn_is_salario_account(NEW.plano_contas_id)) THEN
    NEW.data_competencia := NEW.data_emissao;
  ELSIF NEW.data_competencia IS NULL THEN
    NEW.data_competencia := NEW.data_emissao;
  END IF;
  RETURN NEW;
END;
$$;