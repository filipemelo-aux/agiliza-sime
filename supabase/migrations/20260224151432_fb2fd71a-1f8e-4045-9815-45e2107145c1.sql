
-- Contingency mode tracking per establishment
ALTER TABLE public.fiscal_establishments
  ADD COLUMN IF NOT EXISTS contingency_mode text DEFAULT 'normal', -- normal, svc_an, svc_rs, offline
  ADD COLUMN IF NOT EXISTS contingency_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS contingency_justification text,
  ADD COLUMN IF NOT EXISTS contingency_protocol text;

-- Contingency events history
CREATE TABLE public.contingency_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid REFERENCES public.fiscal_establishments(id) NOT NULL,
  event_type text NOT NULL, -- activated, deactivated, auto_detected, resend_started, resend_completed
  previous_mode text NOT NULL DEFAULT 'normal',
  new_mode text NOT NULL,
  reason text,
  detected_error text,
  documents_pending integer DEFAULT 0,
  documents_resent integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.contingency_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contingency_events"
  ON public.contingency_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_contingency_events_establishment ON public.contingency_events(establishment_id, created_at DESC);

-- Add contingency flag to fiscal_queue
ALTER TABLE public.fiscal_queue
  ADD COLUMN IF NOT EXISTS contingency_mode text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS requires_resend boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_job_id uuid;
