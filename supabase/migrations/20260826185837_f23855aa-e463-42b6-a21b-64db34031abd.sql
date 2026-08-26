CREATE TYPE public.status_parcela_alienacao AS ENUM ('Pendente', 'Pago', 'Atrasado');

CREATE TABLE public.veiculo_alienacao_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  numero_parcela integer NOT NULL,
  total_parcelas integer NOT NULL,
  valor_parcela numeric(14,2) NOT NULL DEFAULT 0,
  data_vencimento date NOT NULL,
  status_pagamento public.status_parcela_alienacao NOT NULL DEFAULT 'Pendente',
  observacoes text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculo_alienacao_parcelas TO authenticated;
GRANT ALL ON public.veiculo_alienacao_parcelas TO service_role;

ALTER TABLE public.veiculo_alienacao_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view alienacao parcelas"
  ON public.veiculo_alienacao_parcelas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert alienacao parcelas"
  ON public.veiculo_alienacao_parcelas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update alienacao parcelas"
  ON public.veiculo_alienacao_parcelas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete alienacao parcelas"
  ON public.veiculo_alienacao_parcelas FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_valp_veiculo ON public.veiculo_alienacao_parcelas(veiculo_id);
CREATE INDEX idx_valp_expense ON public.veiculo_alienacao_parcelas(expense_id);

CREATE TRIGGER trg_valp_updated_at
  BEFORE UPDATE ON public.veiculo_alienacao_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.fn_sync_veiculo_documento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pago' THEN
      UPDATE public.veiculo_documentos
        SET status_pagamento = 'Pago', updated_at = now()
      WHERE expense_id = NEW.id
        AND status_pagamento <> 'Pago';

      UPDATE public.veiculo_alienacao_parcelas
        SET status_pagamento = 'Pago', updated_at = now()
      WHERE expense_id = NEW.id
        AND status_pagamento <> 'Pago';
    ELSE
      UPDATE public.veiculo_documentos
        SET status_pagamento = CASE
              WHEN data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Vencido'::status_pagamento_documento
              ELSE 'A Vencer'::status_pagamento_documento
            END,
            updated_at = now()
      WHERE expense_id = NEW.id
        AND status_pagamento = 'Pago';

      UPDATE public.veiculo_alienacao_parcelas
        SET status_pagamento = CASE
              WHEN data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Atrasado'::status_parcela_alienacao
              ELSE 'Pendente'::status_parcela_alienacao
            END,
            updated_at = now()
      WHERE expense_id = NEW.id
        AND status_pagamento = 'Pago';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;