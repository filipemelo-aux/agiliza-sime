-- 1. Vehicles: instituicao_financeira_id
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS instituicao_financeira_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_instituicao_financeira_id ON public.vehicles(instituicao_financeira_id);

-- Best-effort migration of free text -> profile match
UPDATE public.vehicles v
SET instituicao_financeira_id = p.id
FROM public.profiles p
WHERE v.instituicao_financeira_id IS NULL
  AND v.instituicao_financeira IS NOT NULL
  AND btrim(v.instituicao_financeira) <> ''
  AND (
    lower(btrim(p.razao_social)) = lower(btrim(v.instituicao_financeira))
    OR lower(btrim(p.full_name)) = lower(btrim(v.instituicao_financeira))
    OR lower(btrim(p.nome_fantasia)) = lower(btrim(v.instituicao_financeira))
  );

-- 2. veiculo_documentos: favorecido_id + expense_id
ALTER TABLE public.veiculo_documentos
  ADD COLUMN IF NOT EXISTS favorecido_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_veiculo_documentos_favorecido_id ON public.veiculo_documentos(favorecido_id);
CREATE INDEX IF NOT EXISTS idx_veiculo_documentos_expense_id ON public.veiculo_documentos(expense_id);

-- 3. Status sync from expenses -> veiculo_documentos
CREATE OR REPLACE FUNCTION public.fn_sync_veiculo_documento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pago' THEN
      UPDATE public.veiculo_documentos
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
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_veiculo_documento_status ON public.expenses;
CREATE TRIGGER trg_sync_veiculo_documento_status
AFTER UPDATE OF status ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_veiculo_documento_status();