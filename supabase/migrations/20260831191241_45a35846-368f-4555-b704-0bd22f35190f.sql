REVOKE ALL ON FUNCTION public.fn_empresa_unificada_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_empresa_unificada_id() FROM anon;
REVOKE ALL ON FUNCTION public.fn_empresa_unificada_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_empresa_unificada_id() TO service_role;