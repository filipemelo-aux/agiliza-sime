CREATE OR REPLACE FUNCTION public.fn_norm_natureza(_t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(translate(regexp_replace(trim(coalesce(_t,'')),'\s+',' ','g'),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

CREATE OR REPLACE FUNCTION public.fn_block_duplicate_natureza() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cargas c WHERE c.id <> NEW.id
             AND public.fn_norm_natureza(c.produto_predominante) = public.fn_norm_natureza(NEW.produto_predominante)) THEN
    RAISE EXCEPTION 'Natureza de carga "%" já está cadastrada.', NEW.produto_predominante USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_block_duplicate_natureza() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_block_duplicate_natureza BEFORE INSERT OR UPDATE OF produto_predominante ON public.cargas
FOR EACH ROW EXECUTE FUNCTION public.fn_block_duplicate_natureza();