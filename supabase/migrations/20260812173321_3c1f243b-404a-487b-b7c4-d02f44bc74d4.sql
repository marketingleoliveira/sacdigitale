-- Criar tabela sac_updates
CREATE TABLE public.sac_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sac_request_id UUID NOT NULL REFERENCES public.sac_requests(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    author_email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.sac_updates ENABLE ROW LEVEL SECURITY;

-- Conceder permissões
GRANT SELECT, INSERT ON public.sac_updates TO authenticated;
GRANT ALL ON public.sac_updates TO service_role;

-- Criar políticas de RLS
CREATE POLICY "Usuários autenticados podem ver atualizações"
ON public.sac_updates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem inserir atualizações"
ON public.sac_updates FOR INSERT
TO authenticated
WITH CHECK (true);

-- Index para performance
CREATE INDEX idx_sac_updates_request_id ON public.sac_updates(sac_request_id);
