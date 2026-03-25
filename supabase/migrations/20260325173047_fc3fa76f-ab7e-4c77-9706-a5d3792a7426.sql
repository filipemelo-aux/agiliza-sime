
-- Add operador RLS policies to all tables (same access as moderator/admin)

-- profiles
CREATE POLICY "Operadores can select profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- freights
CREATE POLICY "Operadores can select freights" ON public.freights FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert freights" ON public.freights FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update freights" ON public.freights FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete freights" ON public.freights FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- freight_applications
CREATE POLICY "Operadores can select freight_applications" ON public.freight_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update freight_applications" ON public.freight_applications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- vehicles
CREATE POLICY "Operadores can select vehicles" ON public.vehicles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- trailers
CREATE POLICY "Operadores can select trailers" ON public.trailers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert trailers" ON public.trailers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update trailers" ON public.trailers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete trailers" ON public.trailers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- driver_documents
CREATE POLICY "Operadores can select driver_documents" ON public.driver_documents FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert driver_documents" ON public.driver_documents FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update driver_documents" ON public.driver_documents FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- expenses
CREATE POLICY "Operadores can select expenses" ON public.expenses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- expense_items
CREATE POLICY "Operadores can select expense_items" ON public.expense_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert expense_items" ON public.expense_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update expense_items" ON public.expense_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete expense_items" ON public.expense_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- expense_payments
CREATE POLICY "Operadores can select expense_payments" ON public.expense_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert expense_payments" ON public.expense_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update expense_payments" ON public.expense_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete expense_payments" ON public.expense_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- expense_installments
CREATE POLICY "Operadores can select expense_installments" ON public.expense_installments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert expense_installments" ON public.expense_installments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update expense_installments" ON public.expense_installments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete expense_installments" ON public.expense_installments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- expense_maintenance_items
CREATE POLICY "Operadores can select expense_maintenance_items" ON public.expense_maintenance_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert expense_maintenance_items" ON public.expense_maintenance_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update expense_maintenance_items" ON public.expense_maintenance_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete expense_maintenance_items" ON public.expense_maintenance_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- cargas
CREATE POLICY "Operadores can select cargas" ON public.cargas FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert cargas" ON public.cargas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update cargas" ON public.cargas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete cargas" ON public.cargas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- ctes
CREATE POLICY "Operadores can select ctes" ON public.ctes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert ctes" ON public.ctes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update ctes" ON public.ctes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete ctes" ON public.ctes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fiscal_establishments
CREATE POLICY "Operadores can select fiscal_establishments" ON public.fiscal_establishments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fiscal_establishments" ON public.fiscal_establishments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fiscal_establishments" ON public.fiscal_establishments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete fiscal_establishments" ON public.fiscal_establishments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fiscal_certificates
CREATE POLICY "Operadores can select fiscal_certificates" ON public.fiscal_certificates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fiscal_certificates" ON public.fiscal_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fiscal_certificates" ON public.fiscal_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete fiscal_certificates" ON public.fiscal_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- establishment_certificates
CREATE POLICY "Operadores can select establishment_certificates" ON public.establishment_certificates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert establishment_certificates" ON public.establishment_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update establishment_certificates" ON public.establishment_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete establishment_certificates" ON public.establishment_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fiscal_logs
CREATE POLICY "Operadores can select fiscal_logs" ON public.fiscal_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fiscal_logs" ON public.fiscal_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));

-- fiscal_queue
CREATE POLICY "Operadores can select fiscal_queue" ON public.fiscal_queue FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fiscal_queue" ON public.fiscal_queue FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fiscal_queue" ON public.fiscal_queue FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fiscal_settings
CREATE POLICY "Operadores can select fiscal_settings" ON public.fiscal_settings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fiscal_settings" ON public.fiscal_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- contingency_events
CREATE POLICY "Operadores can select contingency_events" ON public.contingency_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert contingency_events" ON public.contingency_events FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update contingency_events" ON public.contingency_events FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- harvest_jobs
CREATE POLICY "Operadores can select harvest_jobs" ON public.harvest_jobs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert harvest_jobs" ON public.harvest_jobs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update harvest_jobs" ON public.harvest_jobs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete harvest_jobs" ON public.harvest_jobs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- harvest_assignments
CREATE POLICY "Operadores can select harvest_assignments" ON public.harvest_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert harvest_assignments" ON public.harvest_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update harvest_assignments" ON public.harvest_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete harvest_assignments" ON public.harvest_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- harvest_payments
CREATE POLICY "Operadores can select harvest_payments" ON public.harvest_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert harvest_payments" ON public.harvest_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update harvest_payments" ON public.harvest_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete harvest_payments" ON public.harvest_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- quotations
CREATE POLICY "Operadores can select quotations" ON public.quotations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert quotations" ON public.quotations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update quotations" ON public.quotations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete quotations" ON public.quotations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fuelings
CREATE POLICY "Operadores can select fuelings" ON public.fuelings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fuelings" ON public.fuelings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fuelings" ON public.fuelings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete fuelings" ON public.fuelings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- chart_of_accounts
CREATE POLICY "Operadores can select chart_of_accounts" ON public.chart_of_accounts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert chart_of_accounts" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update chart_of_accounts" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete chart_of_accounts" ON public.chart_of_accounts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- financial_categories
CREATE POLICY "Operadores can select financial_categories" ON public.financial_categories FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert financial_categories" ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update financial_categories" ON public.financial_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- financial_invoices
CREATE POLICY "Operadores can select financial_invoices" ON public.financial_invoices FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert financial_invoices" ON public.financial_invoices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update financial_invoices" ON public.financial_invoices FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete financial_invoices" ON public.financial_invoices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- financial_invoice_items
CREATE POLICY "Operadores can select financial_invoice_items" ON public.financial_invoice_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert financial_invoice_items" ON public.financial_invoice_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update financial_invoice_items" ON public.financial_invoice_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete financial_invoice_items" ON public.financial_invoice_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- accounts_receivable
CREATE POLICY "Operadores can select accounts_receivable" ON public.accounts_receivable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert accounts_receivable" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update accounts_receivable" ON public.accounts_receivable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete accounts_receivable" ON public.accounts_receivable FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- accounts_payable
CREATE POLICY "Operadores can select accounts_payable" ON public.accounts_payable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert accounts_payable" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update accounts_payable" ON public.accounts_payable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete accounts_payable" ON public.accounts_payable FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- user_roles (operadores can view but not modify)
CREATE POLICY "Operadores can select user_roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- notifications
CREATE POLICY "Operadores can select notifications" ON public.notifications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update notifications" ON public.notifications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- driver_services
CREATE POLICY "Operadores can select driver_services" ON public.driver_services FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert driver_services" ON public.driver_services FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update driver_services" ON public.driver_services FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete driver_services" ON public.driver_services FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- fuel_orders
CREATE POLICY "Operadores can select fuel_orders" ON public.fuel_orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can insert fuel_orders" ON public.fuel_orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can update fuel_orders" ON public.fuel_orders FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Operadores can delete fuel_orders" ON public.fuel_orders FOR DELETE TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));

-- smtp_settings
CREATE POLICY "Operadores can select smtp_settings" ON public.smtp_settings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operador'::app_role));
