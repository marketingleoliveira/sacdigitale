-- Permitir que admins insiram novos roles
CREATE POLICY "Admins can insert roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Permitir que admins deletem roles
CREATE POLICY "Admins can delete roles" 
ON public.user_roles 
FOR DELETE 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));