-- Add SELECT policy for users to view their own documents
CREATE POLICY "Users can view own documents" 
ON public.driver_documents 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);