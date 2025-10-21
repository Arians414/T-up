-- Add measurement_prefs column to profiles for storing display preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS measurement_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
