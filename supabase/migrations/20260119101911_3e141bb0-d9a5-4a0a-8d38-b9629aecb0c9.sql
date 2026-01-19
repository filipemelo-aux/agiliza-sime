-- Add columns for loading proof and payment workflow
ALTER TABLE public.freight_applications
ADD COLUMN IF NOT EXISTS loading_proof_url text,
ADD COLUMN IF NOT EXISTS loading_proof_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_receipt_url text,
ADD COLUMN IF NOT EXISTS payment_completed_at timestamp with time zone;

-- Add comment for clarity
COMMENT ON COLUMN public.freight_applications.loading_proof_url IS 'URL do comprovante de carregamento enviado pelo motorista';
COMMENT ON COLUMN public.freight_applications.payment_status IS 'Status do pagamento: pending, requested, paid';
COMMENT ON COLUMN public.freight_applications.payment_receipt_url IS 'URL do comprovante de pagamento enviado pelo admin';