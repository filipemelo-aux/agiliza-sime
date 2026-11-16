REVOKE EXECUTE ON FUNCTION public.merge_duplicate_profiles(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_profiles(uuid, uuid) TO service_role;