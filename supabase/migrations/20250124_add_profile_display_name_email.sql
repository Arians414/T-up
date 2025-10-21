-- Add display_name and contact_email columns if they do not exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email TEXT;
