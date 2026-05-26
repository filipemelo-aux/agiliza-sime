
-- bank_reconciliations
DROP POLICY IF EXISTS "Authenticated users can manage reconciliations" ON public.bank_reconciliations;
CREATE POLICY "Admins/Moderators manage bank_reconciliations"
  ON public.bank_reconciliations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- bank_reconciliation_items
DROP POLICY IF EXISTS "Authenticated users can manage reconciliation items" ON public.bank_reconciliation_items;
CREATE POLICY "Admins/Moderators manage bank_reconciliation_items"
  ON public.bank_reconciliation_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- movimentacoes_bancarias
DROP POLICY IF EXISTS "Authenticated users can manage movimentacoes" ON public.movimentacoes_bancarias;
CREATE POLICY "Admins/Moderators manage movimentacoes_bancarias"
  ON public.movimentacoes_bancarias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- contas_receber
DROP POLICY IF EXISTS "Authenticated users can read contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "Authenticated users can insert contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "Authenticated users can update contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "Authenticated users can delete contas_receber" ON public.contas_receber;
CREATE POLICY "Admin/Mod/Op select contas_receber" ON public.contas_receber FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op insert contas_receber" ON public.contas_receber FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op update contas_receber" ON public.contas_receber FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod delete contas_receber" ON public.contas_receber FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- faturas_recebimento
DROP POLICY IF EXISTS "Authenticated users can read faturas" ON public.faturas_recebimento;
DROP POLICY IF EXISTS "Authenticated users can insert faturas" ON public.faturas_recebimento;
DROP POLICY IF EXISTS "Authenticated users can update faturas" ON public.faturas_recebimento;
DROP POLICY IF EXISTS "Authenticated users can delete faturas" ON public.faturas_recebimento;
CREATE POLICY "Admin/Mod/Op select faturas" ON public.faturas_recebimento FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op insert faturas" ON public.faturas_recebimento FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op update faturas" ON public.faturas_recebimento FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod delete faturas" ON public.faturas_recebimento FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- previsoes_recebimento
DROP POLICY IF EXISTS "Authenticated users can read previsoes" ON public.previsoes_recebimento;
DROP POLICY IF EXISTS "Authenticated users can insert previsoes" ON public.previsoes_recebimento;
DROP POLICY IF EXISTS "Authenticated users can update previsoes" ON public.previsoes_recebimento;
DROP POLICY IF EXISTS "Authenticated users can delete previsoes" ON public.previsoes_recebimento;
CREATE POLICY "Admin/Mod/Op select previsoes" ON public.previsoes_recebimento FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op insert previsoes" ON public.previsoes_recebimento FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op update previsoes" ON public.previsoes_recebimento FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod delete previsoes" ON public.previsoes_recebimento FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- fatura_previsoes
DROP POLICY IF EXISTS "Authenticated users can read fatura_previsoes" ON public.fatura_previsoes;
DROP POLICY IF EXISTS "Authenticated users can insert fatura_previsoes" ON public.fatura_previsoes;
DROP POLICY IF EXISTS "Authenticated users can delete fatura_previsoes" ON public.fatura_previsoes;
CREATE POLICY "Admin/Mod/Op select fatura_previsoes" ON public.fatura_previsoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod/Op insert fatura_previsoes" ON public.fatura_previsoes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admin/Mod delete fatura_previsoes" ON public.fatura_previsoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- receivable_payments
DROP POLICY IF EXISTS "Authenticated read receivable_payments" ON public.receivable_payments;
CREATE POLICY "Admin/Mod/Op select receivable_payments" ON public.receivable_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));

-- credit_card_invoices SELECT
DROP POLICY IF EXISTS "cc_invoices_select_all_authenticated" ON public.credit_card_invoices;
CREATE POLICY "cc_invoices_select_admin_mod_op" ON public.credit_card_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));

-- credit_card_invoice_items SELECT
DROP POLICY IF EXISTS "cc_invoice_items_select_all_authenticated" ON public.credit_card_invoice_items;
CREATE POLICY "cc_invoice_items_select_admin_mod_op" ON public.credit_card_invoice_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));

-- rh_config: drop open read
DROP POLICY IF EXISTS "Authenticated read rh_config" ON public.rh_config;
CREATE POLICY "Admin/Mod read rh_config" ON public.rh_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- fiscal_settings: remove operador
DROP POLICY IF EXISTS "Operadores can select fiscal_settings" ON public.fiscal_settings;
DROP POLICY IF EXISTS "Operadores can update fiscal_settings" ON public.fiscal_settings;

-- smtp_settings: remove operador read
DROP POLICY IF EXISTS "Operadores can select smtp_settings" ON public.smtp_settings;

-- profiles: remove operador-all-profiles select
DROP POLICY IF EXISTS "Operadores can select profiles" ON public.profiles;

-- expense_installments: remove unscoped subquery policy
DROP POLICY IF EXISTS "Users can manage installments of their expenses" ON public.expense_installments;
