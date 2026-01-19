-- Allow drivers to read payment receipts from freight-proofs bucket
-- Payment receipts are stored in payment_receipt/ folder with application_id in the filename
CREATE POLICY "Users can read their own payment receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'freight-proofs' 
  AND (storage.foldername(name))[1] = 'payment_receipt'
  AND EXISTS (
    SELECT 1 FROM public.freight_applications fa
    WHERE fa.user_id = auth.uid()
    AND fa.payment_receipt_url = name
  )
);