ALTER TABLE public.internal_ticket_logs ADD COLUMN IF NOT EXISTS email_body text;
ALTER TABLE public.internal_ticket_logs ADD COLUMN IF NOT EXISTS subject text;

-- Grant permissions again to be sure
GRANT SELECT, INSERT ON public.internal_ticket_logs TO authenticated;
GRANT ALL ON public.internal_ticket_logs TO service_role;