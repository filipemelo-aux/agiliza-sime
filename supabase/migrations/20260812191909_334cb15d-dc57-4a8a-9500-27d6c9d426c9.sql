REVOKE EXECUTE ON FUNCTION public.save_credit_card_invoice_edit(uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_credit_card_invoice_edit(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_credit_card_invoice_edit(uuid, jsonb, jsonb) TO authenticated;