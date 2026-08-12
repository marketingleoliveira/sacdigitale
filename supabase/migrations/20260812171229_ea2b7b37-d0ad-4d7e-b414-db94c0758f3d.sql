
-- 1. Atualizar política de atualização para incluir vendas
-- Primeiro removemos a política restritiva anterior
DROP POLICY IF EXISTS "Staff can update SAC requests" ON public.sac_requests;

-- Criamos a nova política que permite is_staff (inclui vendas) atualizar
CREATE POLICY "Staff can update SAC requests"
  ON public.sac_requests FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 2. Garantir permissões de insert em tickets para vendas (logs de edição)
DROP POLICY IF EXISTS "Staff can create tickets" ON public.tickets;
CREATE POLICY "Staff can create tickets" 
  ON public.tickets FOR INSERT 
  TO authenticated 
  WITH CHECK (public.is_staff(auth.uid()));

-- 3. Tabela de logs para edições de SAC (opcional, mas bom para auditoria além dos tickets)
CREATE TABLE IF NOT EXISTS public.sac_edit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sac_request_id UUID REFERENCES public.sac_requests(id) ON DELETE CASCADE,
    edited_by UUID REFERENCES auth.users(id),
    edited_by_email TEXT,
    field_edited TEXT DEFAULT 'order_number',
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.sac_edit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.sac_edit_logs TO authenticated;
GRANT ALL ON public.sac_edit_logs TO service_role;

CREATE POLICY "Staff can view edit logs" ON public.sac_edit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert edit logs" ON public.sac_edit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
