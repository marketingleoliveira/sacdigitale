ALTER TABLE public.email_communications ADD COLUMN IF NOT EXISTS email_body text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_communications TO authenticated;
GRANT ALL ON public.email_communications TO service_role;