CREATE POLICY "Authenticated users can delete previsoes"
ON public.previsoes_recebimento
FOR DELETE
TO authenticated
USING (true);