
CREATE TABLE public.complaint_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.complaint_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_types TO authenticated;
GRANT ALL ON public.complaint_types TO service_role;

ALTER TABLE public.complaint_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active complaint types"
ON public.complaint_types FOR SELECT
USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert complaint types"
ON public.complaint_types FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update complaint types"
ON public.complaint_types FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete complaint types"
ON public.complaint_types FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_complaint_types_updated_at
BEFORE UPDATE ON public.complaint_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sac_requests ADD COLUMN IF NOT EXISTS complaint_type text;

INSERT INTO public.complaint_types (name) VALUES
  ('Produto com defeito'),
  ('Atraso na entrega'),
  ('Cobrança indevida'),
  ('Atendimento'),
  ('Outros')
ON CONFLICT (name) DO NOTHING;
