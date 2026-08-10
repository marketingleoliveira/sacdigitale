-- Adicionar configurações para notificação interna via e-mail
ALTER TABLE public.email_settings 
ADD COLUMN IF NOT EXISTS internal_notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS internal_notification_emails TEXT DEFAULT 'gerente@digitaletextil.com.br, renato@digitaletextil.com.br';

COMMENT ON COLUMN public.email_settings.internal_notifications_enabled IS 'Se ativado, envia cópia de tickets internos para os e-mails configurados.';
COMMENT ON COLUMN public.email_settings.internal_notification_emails IS 'Lista de e-mails separados por vírgula para receber notificações internas.';
