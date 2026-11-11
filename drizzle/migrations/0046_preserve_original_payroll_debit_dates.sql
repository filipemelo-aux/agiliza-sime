ALTER TABLE public.descontos_folha ADD COLUMN data_original date;
COMMENT ON COLUMN public.descontos_folha.data_original IS 'Original debit date for display; data_referencia remains the installment payroll period.';
UPDATE public.descontos_folha d SET data_original=e.data_emissao FROM public.expenses e WHERE d.adiantamento_origem_id=e.id AND d.tenant_id=e.tenant_id;
UPDATE public.descontos_folha d SET data_original=p.data_referencia FROM public.descontos_folha p WHERE d.data_original IS NULL AND d.plano_desconto_id=p.plano_desconto_id AND d.tenant_id=p.tenant_id AND p.parcela_numero=1;
CREATE OR REPLACE FUNCTION public.set_payroll_debit_original_date() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.data_original IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.adiantamento_origem_id IS NOT NULL THEN
 SELECT data_emissao INTO NEW.data_original FROM public.expenses WHERE id=NEW.adiantamento_origem_id AND tenant_id=NEW.tenant_id;
 END IF;
 IF NEW.data_original IS NULL AND NEW.plano_desconto_id IS NOT NULL THEN
 SELECT data_original INTO NEW.data_original FROM public.descontos_folha WHERE plano_desconto_id=NEW.plano_desconto_id AND tenant_id=NEW.tenant_id AND parcela_numero=1;
 END IF;
 NEW.data_original:=coalesce(NEW.data_original,NEW.data_referencia);
 RETURN NEW;
END $$;
CREATE TRIGGER set_payroll_debit_original_date BEFORE INSERT ON public.descontos_folha FOR EACH ROW EXECUTE FUNCTION public.set_payroll_debit_original_date();