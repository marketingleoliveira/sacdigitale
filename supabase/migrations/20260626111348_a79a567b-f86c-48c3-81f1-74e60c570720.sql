
-- 1) Add new role values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'desenvolvedor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'qualidade';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerencia';

-- 2) Helper functions (use ::text to avoid enum literal binding at create time)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','desenvolvedor','qualidade','gerencia')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','desenvolvedor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','desenvolvedor','gerencia')
  )
$$;

-- 3) Replace policies on sac_requests
DROP POLICY IF EXISTS "Admins can view all SAC requests" ON public.sac_requests;
DROP POLICY IF EXISTS "Admins can update SAC requests" ON public.sac_requests;
DROP POLICY IF EXISTS "Admins can delete SAC requests" ON public.sac_requests;
CREATE POLICY "Staff can view all SAC requests" ON public.sac_requests
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update SAC requests" ON public.sac_requests
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Super admins can delete SAC requests" ON public.sac_requests
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- 4) Replace policies on tickets
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins can delete tickets" ON public.tickets;
CREATE POLICY "Staff can view all tickets" ON public.tickets
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can create tickets" ON public.tickets
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update tickets" ON public.tickets
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Super admins can delete tickets" ON public.tickets
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- 5) email_communications
DROP POLICY IF EXISTS "Admins view all email communications" ON public.email_communications;
DROP POLICY IF EXISTS "Admins insert email communications" ON public.email_communications;
CREATE POLICY "Staff view all email communications" ON public.email_communications
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff insert email communications" ON public.email_communications
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- 6) complaint_types
DROP POLICY IF EXISTS "Anyone can view active complaint types" ON public.complaint_types;
DROP POLICY IF EXISTS "Admins can insert complaint types" ON public.complaint_types;
DROP POLICY IF EXISTS "Admins can update complaint types" ON public.complaint_types;
DROP POLICY IF EXISTS "Admins can delete complaint types" ON public.complaint_types;
CREATE POLICY "Anyone can view active complaint types" ON public.complaint_types
  FOR SELECT USING ((active = true) OR public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert complaint types" ON public.complaint_types
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update complaint types" ON public.complaint_types
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Super admins can delete complaint types" ON public.complaint_types
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- 7) user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "User managers can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_users(auth.uid()));
CREATE POLICY "User managers can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.can_manage_users(auth.uid())) WITH CHECK (public.can_manage_users(auth.uid()));
CREATE POLICY "User managers can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.can_manage_users(auth.uid()));
