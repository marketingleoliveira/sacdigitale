-- 1. Remover políticas antigas de atualização para evitar conflitos
DROP POLICY IF EXISTS "Staff can update SAC requests" ON public.sac_requests;

-- 2. Recriar política de atualização para sac_requests
CREATE POLICY "Staff can update SAC requests"
  ON public.sac_requests FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 3. Ajustar grants na tabela de logs para garantir que Vendas possa registrar auditoria
GRANT SELECT, INSERT ON public.sac_edit_logs TO authenticated;
