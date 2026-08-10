CREATE TABLE public.internal_ticket_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message TEXT,
    recipient_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.internal_ticket_logs TO authenticated;
GRANT ALL ON public.internal_ticket_logs TO service_role;

ALTER TABLE public.internal_ticket_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Desenvolvedores e Gerência podem ver logs"
ON public.internal_ticket_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'desenvolvedor') OR public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'admin'));
