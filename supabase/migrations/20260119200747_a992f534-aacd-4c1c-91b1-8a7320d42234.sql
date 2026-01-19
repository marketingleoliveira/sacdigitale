-- Add author_email column to store the email of who created the ticket
ALTER TABLE public.tickets ADD COLUMN author_email text;

-- Update existing tickets with a placeholder (will show as "Admin" in UI)
UPDATE public.tickets SET author_email = 'admin@digitaletextil.com.br' WHERE author_email IS NULL;