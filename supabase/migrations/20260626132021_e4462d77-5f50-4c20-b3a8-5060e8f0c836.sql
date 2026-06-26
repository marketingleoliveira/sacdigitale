
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bcc_enabled boolean NOT NULL DEFAULT true,
  bcc_email text NOT NULL DEFAULT 'gerente@digitaletextil.com.br',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read email settings"
ON public.email_settings FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Managers can insert email settings"
ON public.email_settings FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE POLICY "Managers can update email settings"
ON public.email_settings FOR UPDATE
TO authenticated
USING (public.can_manage_users(auth.uid()))
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE TRIGGER update_email_settings_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.email_settings (bcc_enabled, bcc_email)
VALUES (true, 'gerente@digitaletextil.com.br');

ALTER TABLE public.email_communications
ADD COLUMN IF NOT EXISTS bcc_email text;
