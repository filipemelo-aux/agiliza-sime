CREATE POLICY "cc_invoices_update_operador" ON public.credit_card_invoices FOR UPDATE TO authenticated USING (has_role(auth.uid(),'operador'::app_role)) WITH CHECK (has_role(auth.uid(),'operador'::app_role));
CREATE POLICY "cc_invoices_delete_operador" ON public.credit_card_invoices FOR DELETE TO authenticated USING (has_role(auth.uid(),'operador'::app_role));
CREATE POLICY "cc_invoice_items_update_operador" ON public.credit_card_invoice_items FOR UPDATE TO authenticated USING (has_role(auth.uid(),'operador'::app_role)) WITH CHECK (has_role(auth.uid(),'operador'::app_role));
CREATE POLICY "cc_invoice_items_delete_operador" ON public.credit_card_invoice_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'operador'::app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_invoice_items TO authenticated;