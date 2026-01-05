-- Allow admins to update SAC requests (for status changes)
CREATE POLICY "Admins can update SAC requests"
ON public.sac_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));