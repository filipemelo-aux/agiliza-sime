DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Staff or self can insert notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'operador'::app_role)));

DROP POLICY IF EXISTS "Autenticados podem editar documentos de veiculos" ON public.veiculo_documentos;
DROP POLICY IF EXISTS "Autenticados podem excluir documentos de veiculos" ON public.veiculo_documentos;
DROP POLICY IF EXISTS "Autenticados podem criar documentos de veiculos" ON public.veiculo_documentos;
DROP POLICY IF EXISTS "Autenticados podem ver documentos de veiculos" ON public.veiculo_documentos;
CREATE POLICY "Admins/Moderators manage veiculo_documentos" ON public.veiculo_documentos FOR ALL TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)));

DROP POLICY IF EXISTS "Authenticated can delete alienacao parcelas" ON public.veiculo_alienacao_parcelas;
DROP POLICY IF EXISTS "Authenticated can update alienacao parcelas" ON public.veiculo_alienacao_parcelas;
DROP POLICY IF EXISTS "Authenticated can insert alienacao parcelas" ON public.veiculo_alienacao_parcelas;
DROP POLICY IF EXISTS "Authenticated can view alienacao parcelas" ON public.veiculo_alienacao_parcelas;
CREATE POLICY "Admins/Moderators manage alienacao parcelas" ON public.veiculo_alienacao_parcelas FOR ALL TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'operador'::app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'operador'::app_role)));
CREATE POLICY "Consultor read alienacao parcelas" ON public.veiculo_alienacao_parcelas FOR SELECT TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()),'consultor'::app_role)));

DROP POLICY IF EXISTS "Users can view establishment_certificates" ON public.establishment_certificates;
CREATE POLICY "Moderators can select establishment_certificates" ON public.establishment_certificates FOR SELECT TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'operador'::app_role)));

DROP POLICY IF EXISTS "Authenticated can view cheque links" ON public.cheque_expense_links;
DROP POLICY IF EXISTS "Authenticated can view cheques" ON public.cheques;
DROP POLICY IF EXISTS "Authenticated can view contas_bancarias" ON public.contas_bancarias;
DROP POLICY IF EXISTS "Authenticated can view check layouts" ON public.check_layouts;

DROP POLICY IF EXISTS "rateio_insert_auth" ON public.despesa_rateio_veiculos;
DROP POLICY IF EXISTS "rateio_select_auth" ON public.despesa_rateio_veiculos;
CREATE POLICY "rateio_admin_mod_select_insert" ON public.despesa_rateio_veiculos FOR SELECT TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)));
CREATE POLICY "rateio_admin_mod_insert" ON public.despesa_rateio_veiculos FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()),'admin'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()),'moderator'::app_role)));