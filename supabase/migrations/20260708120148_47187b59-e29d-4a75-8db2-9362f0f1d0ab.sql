
-- 1. Add 'vendas' role to enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendas';

-- 2. Add display_name to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS display_name text;

-- 3. Add author_name to tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS author_name text;
