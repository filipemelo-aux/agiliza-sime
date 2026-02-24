
-- Tabela de fila de processamento fiscal
CREATE TABLE public.fiscal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL, -- 'cte_emit', 'cte_cancel', 'mdfe_emit', 'mdfe_encerrar'
  entity_id uuid NOT NULL, -- cte.id ou mdfe.id
  establishment_id uuid REFERENCES public.fiscal_establishments(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, timeout
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  timeout_seconds integer NOT NULL DEFAULT 120,
  error_message text,
  result jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz DEFAULT now()
);

-- Índices para performance do worker
CREATE INDEX idx_fiscal_queue_status ON public.fiscal_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_fiscal_queue_next_retry ON public.fiscal_queue(next_retry_at) WHERE status = 'pending';

-- RLS
ALTER TABLE public.fiscal_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fiscal_queue"
  ON public.fiscal_queue FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for queue status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.fiscal_queue;
