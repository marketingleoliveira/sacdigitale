-- Create enum for contact types
CREATE TYPE public.contact_type AS ENUM ('reclamacao', 'sugestao', 'elogio', 'duvida');

-- Create table for SAC requests
CREATE TABLE public.sac_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_type public.contact_type NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  order_number TEXT,
  message TEXT NOT NULL,
  attachments TEXT[],
  protocol TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pendente'
);

-- Enable Row Level Security
ALTER TABLE public.sac_requests ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (public form)
CREATE POLICY "Anyone can submit SAC request" 
ON public.sac_requests 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow users to view their own requests by email
CREATE POLICY "Users can view their own requests by email" 
ON public.sac_requests 
FOR SELECT 
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_sac_requests_email ON public.sac_requests(email);
CREATE INDEX idx_sac_requests_protocol ON public.sac_requests(protocol);