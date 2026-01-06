-- Create storage bucket for SAC attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('sac-attachments', 'sac-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload files to sac-attachments bucket
CREATE POLICY "Anyone can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sac-attachments');

-- Allow anyone to view attachments (public bucket)
CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'sac-attachments');