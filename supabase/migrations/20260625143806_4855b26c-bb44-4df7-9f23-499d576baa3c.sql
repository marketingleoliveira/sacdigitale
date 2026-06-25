CREATE TABLE public.email_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sac_request_id uuid NOT NULL REFERENCES public.sac_requests(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  body text NOT NULL,
  resend_id text,
  sent_by uuid,
  sent_by_email text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_comm_sac ON public.email_communications(sac_request_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.email_communications TO authenticated;
GRANT ALL ON public.email_communications TO service_role;

ALTER TABLE public.email_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all email communications"
ON public.email_communications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert email communications"
ON public.email_communications FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));