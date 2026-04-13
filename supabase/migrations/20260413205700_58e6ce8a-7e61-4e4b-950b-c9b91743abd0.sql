CREATE POLICY "Authenticated users can delete faturas"
ON public.faturas_recebimento
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete contas_receber"
ON public.contas_receber
FOR DELETE
TO authenticated
USING (true);