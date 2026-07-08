
-- Include 'vendas' in is_staff so they can access sac_requests, tickets, user_roles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','desenvolvedor','qualidade','gerencia','vendas')
  )
$function$;

-- New function for external communication access (excludes vendas)
CREATE OR REPLACE FUNCTION public.has_external_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','desenvolvedor','qualidade','gerencia')
  )
$function$;

-- Rewrite email_communications policies to exclude 'vendas'
DROP POLICY IF EXISTS "Staff view all email communications" ON public.email_communications;
DROP POLICY IF EXISTS "Staff insert email communications" ON public.email_communications;

CREATE POLICY "Staff with external access view emails"
  ON public.email_communications FOR SELECT
  USING (public.has_external_access(auth.uid()));

CREATE POLICY "Staff with external access insert emails"
  ON public.email_communications FOR INSERT
  WITH CHECK (public.has_external_access(auth.uid()));

-- Restrict tickets DELETE/UPDATE for vendas (they can only INSERT + SELECT)
-- SELECT + INSERT already fine via is_staff. Restrict UPDATE to non-vendas
DROP POLICY IF EXISTS "Staff can update tickets" ON public.tickets;
CREATE POLICY "Staff can update tickets"
  ON public.tickets FOR UPDATE
  USING (public.has_external_access(auth.uid()))
  WITH CHECK (public.has_external_access(auth.uid()));

-- Prevent vendas from updating sac_requests (view-only for them)
DROP POLICY IF EXISTS "Staff can update SAC requests" ON public.sac_requests;
CREATE POLICY "Staff can update SAC requests"
  ON public.sac_requests FOR UPDATE
  USING (public.has_external_access(auth.uid()))
  WITH CHECK (public.has_external_access(auth.uid()));
