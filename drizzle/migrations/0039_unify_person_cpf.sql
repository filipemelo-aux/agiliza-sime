UPDATE public.profiles p SET cnpj = regexp_replace(d.cpf,'\D','','g')
FROM public.driver_documents d
WHERE d.user_id = p.user_id AND coalesce(p.cnpj,'') = ''
  AND length(regexp_replace(coalesce(d.cpf,''),'\D','','g')) = 11
  AND regexp_replace(d.cpf,'\D','','g') <> '00000000000';

CREATE OR REPLACE FUNCTION public.fn_sync_cpf_doc_to_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := regexp_replace(coalesce(NEW.cpf,''),'\D','','g');
BEGIN
  IF length(v) = 11 AND v <> '00000000000' THEN
    UPDATE public.profiles SET cnpj = v
     WHERE user_id = NEW.user_id AND coalesce(person_type,'cpf') = 'cpf'
       AND cnpj IS DISTINCT FROM v;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_cpf_doc_to_profile ON public.driver_documents;
CREATE TRIGGER trg_sync_cpf_doc_to_profile AFTER INSERT OR UPDATE OF cpf ON public.driver_documents
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cpf_doc_to_profile();

CREATE OR REPLACE FUNCTION public.fn_sync_cpf_profile_to_doc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := regexp_replace(coalesce(NEW.cnpj,''),'\D','','g');
BEGIN
  IF NEW.user_id IS NOT NULL AND length(v) = 11 THEN
    UPDATE public.driver_documents SET cpf = v
     WHERE user_id = NEW.user_id AND cpf IS DISTINCT FROM v;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_cpf_profile_to_doc ON public.profiles;
CREATE TRIGGER trg_sync_cpf_profile_to_doc AFTER INSERT OR UPDATE OF cnpj, user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cpf_profile_to_doc();

COMMENT ON COLUMN public.driver_documents.cpf IS 'MIRROR: canonical CPF is profiles.cnpj; kept in sync by triggers';